---
title: "FreeRTOS 内核源码解读 08：任务通知与 Event Group"
description: "沿 FreeRTOS-Kernel V11.3.0 的 tasks.c 与 event_groups.c 分析 notification state/value、wait/take、FromISR 唤醒和 Event Group bit 扫描。"
pubDate: "2026-08-23"
series: freertos
order: 8
tags: ["FreeRTOS", "Task Notification", "Event Group", "Source Code"]
draft: false
---

# FreeRTOS 内核源码解读 08：任务通知与 Event Group

Task notification 和 Event Group 都能让任务等待“某个条件发生”，但对象模型完全不同。Notification 的值与状态直接存在目标 TCB 中，发送者必须知道具体任务；Event Group 是独立共享对象，多条等待条件编码在任务事件节点里，set bits 时需要扫描所有 waiter。

本篇固定使用 **FreeRTOS-Kernel V11.3.0**，commit `9b777ae5c5b8e9e456065a00294d1e5f5f9facf5`。只沿源码解释两种机制怎样保存条件、阻塞和解除任务，不做脱离执行路径的 API 选型列表。

## notification slot 是 TCB 内部的一对 value/state

打开 `configUSE_TASK_NOTIFICATIONS` 后，每个 TCB 拥有由 `configTASK_NOTIFICATION_ARRAY_ENTRIES` 决定的槽数组：

```c
volatile uint32_t ulNotifiedValue[ configTASK_NOTIFICATION_ARRAY_ENTRIES ];
volatile uint8_t ucNotifyState[ configTASK_NOTIFICATION_ARRAY_ENTRIES ];
```

value 保存 32 位 payload/count/bits，state 区分三个阶段：没有等待、正在等待、已经收到通知。数组下标允许同一任务使用多个互不干扰的通知通道，但每个槽仍只有一个固定接收者——拥有该 TCB 的任务。

Notification 不分配 Queue_t，不维护独立事件链表。等待 notification 的任务只把自己的 `xStateListItem` 放入 delayed list 处理 timeout；源码断言 `xEventListItem` 此时没有 container。发送者已经持有目标 `TaskHandle_t`，所以无需在共享对象中保存 waiter 列表。

这也是 notification 快速的根本原因：找到目标 TCB 后，只需在一个短临界区中修改 value/state，并在目标确实处于 waiting 时移动一条状态节点。

## xTaskGenericNotify 先提交 value/state，再决定是否唤醒

[`xTaskGenericNotify()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L7916-L8033) 在 critical section 中保存原 state，把新 state 设为 `taskNOTIFICATION_RECEIVED`，再按 `eNotifyAction` 更新 value：

```c
ucOriginalNotifyState = pxTCB->ucNotifyState[ uxIndexToNotify ];
pxTCB->ucNotifyState[ uxIndexToNotify ] = taskNOTIFICATION_RECEIVED;

switch( eAction )
{
    case eSetBits:
        pxTCB->ulNotifiedValue[ uxIndexToNotify ] |= ulValue;
        break;

    case eIncrement:
        pxTCB->ulNotifiedValue[ uxIndexToNotify ]++;
        break;

    case eSetValueWithOverwrite:
        pxTCB->ulNotifiedValue[ uxIndexToNotify ] = ulValue;
        break;

    case eSetValueWithoutOverwrite:
        if( ucOriginalNotifyState != taskNOTIFICATION_RECEIVED )
        {
            pxTCB->ulNotifiedValue[ uxIndexToNotify ] = ulValue;
        }
        else
        {
            xReturn = pdFAIL;
        }
        break;

    case eNoAction:
        break;
}
```

`eSetValueWithoutOverwrite` 判断的是旧 state 是否已有 pending notification，而不是 value 是否为零。一个 value 恰好为零的通知仍可能处于 RECEIVED 状态，不能被无条件覆盖。

state/value 提交完成后，只有 `ucOriginalNotifyState == taskWAITING_NOTIFICATION` 才需要解除阻塞：

```c
if( ucOriginalNotifyState == taskWAITING_NOTIFICATION )
{
    listREMOVE_ITEM( &( pxTCB->xStateListItem ) );
    prvAddTaskToReadyList( pxTCB );

    configASSERT(
        listLIST_ITEM_CONTAINER( &( pxTCB->xEventListItem ) ) == NULL );

    taskYIELD_ANY_CORE_IF_USING_PREEMPTION( pxTCB );
}
```

如果目标没有等待，通知仍保存在槽里，下一次 wait/take 直接消费，不会丢失。Notification 是“一槽一份 pending 状态”，不是每次发送都排入独立消息节点；连续 overwrite 或 set bits 会按照 action 合并到同一个 value。

## wait/take 的临界区解决“检查后、阻塞前”竞态

等待路径最大的风险是 lost wakeup：任务检查 state/value 尚未满足，ISR 随即发送通知，但任务之后仍把自己标记为 waiting 并阻塞。FreeRTOS 用 scheduler suspend 加短 critical section，把“重新检查”和“设置 waiting”变成原子步骤。

[`xTaskGenericNotifyWait()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L7802-L7913) 的关键部分如下：

```c
vTaskSuspendAll();
{
    taskENTER_CRITICAL();
    {
        if( pxCurrentTCB->ucNotifyState[ uxIndexToWaitOn ] !=
            taskNOTIFICATION_RECEIVED )
        {
            pxCurrentTCB->ulNotifiedValue[ uxIndexToWaitOn ] &=
                ~ulBitsToClearOnEntry;
            pxCurrentTCB->ucNotifyState[ uxIndexToWaitOn ] =
                taskWAITING_NOTIFICATION;
            xShouldBlock = pdTRUE;
        }
    }
    taskEXIT_CRITICAL();

    if( xShouldBlock == pdTRUE )
    {
        prvAddCurrentTaskToDelayedList( xTicksToWait, pdTRUE );
    }
}
xTaskResumeAll();
```

ISR 只能在同一个受保护窗口之外修改 state。若通知先到，第二次检查看到 RECEIVED，任务不阻塞；若任务先写 WAITING，发送路径看到旧 state 为 WAITING，立即把任务从 delayed list 移回 ready。两种顺序都不会丢事件。

任务恢复后在 critical section 中读取 value，判断 state 是否为 RECEIVED，以区分通知与 timeout。成功时先把当前 value 返回给调用者，再清除 `ulBitsToClearOnExit`；最后无论成功还是 timeout，state 都回到 NOT_WAITING。

`ulTaskGenericNotifyTake()` 使用相同的防丢唤醒框架，但把 value 解释为 count。返回前若 `xClearCountOnExit` 为真就清零，否则减一。它因此可以模拟 binary/counting semaphore 的消费语义，却仍然没有独立 holder 或多 waiter 能力。

## FromISR 路径在 scheduler suspended 时借用 pending ready

[`xTaskGenericNotifyFromISR()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L8036-L8215) 使用 port ISR mask 原子更新 value/state。目标原先处于 WAITING 时，解除方式取决于 scheduler 状态：

```c
if( uxSchedulerSuspended == 0U )
{
    listREMOVE_ITEM( &( pxTCB->xStateListItem ) );
    prvAddTaskToReadyList( pxTCB );
}
else
{
    listINSERT_END(
        &( xPendingReadyList ), &( pxTCB->xEventListItem ) );
}
```

正常情况下直接从 delayed list 移除状态节点并进入 ready list。scheduler suspended 时不能修改 ready/delayed 关系，于是临时使用本来空闲的 `xEventListItem` 把 TCB 放入 pending ready。`xTaskResumeAll()` 后续会移除 event item 和原 state item，再加入真实 ready list。

如果目标优先级高于当前任务，FromISR 路径设置 `*pxHigherPriorityTaskWoken = pdTRUE`，同时记录 pending yield。调用者应在 ISR 退出时使用 port 提供的 yield 宏；通知 API 自己不在中断中直接切换栈。

## EventGroup_t 是共享 bits 加一条无序 waiter list

Event Group 需要独立对象，因为多个任务可以等待不同 bit mask。[`event_groups.c`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/event_groups.c#L48-L67) 中的核心结构很小：

```c
typedef struct EventGroupDef_t
{
    EventBits_t uxEventBits;
    List_t xTasksWaitingForBits;
} EventGroup_t;
```

等待条件不单独分配对象，而是编码进任务 `xEventListItem.xItemValue`：低位保存 `uxBitsToWaitFor`，高控制位保存 wait-all 和 clear-on-exit。因为这个 value 同时是 mask 和 flags，不是可按数值排序的优先级，任务使用 `vTaskPlaceOnUnorderedEventList()` 加入 waiter list。

EventBits_t 中有一部分高位被内核占用为控制位，应用不能等待或设置这些 bit。可用 bit 数因此小于底层整数宽度。

## wait 先检查共享快照，不满足才编码条件并阻塞

[`xEventGroupWaitBits()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/event_groups.c#L312-L466) 在 scheduler suspended 窗口读取 `uxEventBits`，先判断条件是否已经满足：

```c
const EventBits_t uxCurrentEventBits = pxEventBits->uxEventBits;

xWaitConditionMet = prvTestWaitCondition(
    uxCurrentEventBits, uxBitsToWaitFor, xWaitForAllBits );

if( xWaitConditionMet != pdFALSE )
{
    uxReturn = uxCurrentEventBits;

    if( xClearOnExit != pdFALSE )
    {
        pxEventBits->uxEventBits &= ~uxBitsToWaitFor;
    }
}
else if( xTicksToWait != 0U )
{
    vTaskPlaceOnUnorderedEventList(
        &( pxEventBits->xTasksWaitingForBits ),
        uxBitsToWaitFor | uxControlBits,
        xTicksToWait );
}
```

立即满足时返回的是清位前快照，之后才按请求修改共享 bits。不满足且允许等待时，mask/flags 写入 event item，状态节点进入 delayed list 处理 timeout。

任务恢复时，`uxTaskResetEventItemValue()` 取得 set bits 路径提前写回 event item 的快照。`eventUNBLOCKED_DUE_TO_BIT_SET` 区分“条件满足”与“timeout 到期”。若 timeout 与新 set bits 竞争，任务会在 critical section 中重新测试当前 bits，避免刚超时就错过已经成立的条件。

## set bits 必须扫描所有 waiter，再统一 clear-on-exit

[`xEventGroupSetBits()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/event_groups.c#L547-L646) 先 OR 新 bits，然后遍历完整 waiter list：

```c
pxEventBits->uxEventBits |= uxBitsToSet;

while( pxListItem != pxListEnd )
{
    pxNext = listGET_NEXT( pxListItem );
    uxBitsWaitedFor = listGET_LIST_ITEM_VALUE( pxListItem );

    uxControlBits = uxBitsWaitedFor & eventEVENT_BITS_CONTROL_BYTES;
    uxBitsWaitedFor &= ~eventEVENT_BITS_CONTROL_BYTES;

    /* 按 wait-any 或 wait-all 判断 xMatchFound。 */

    if( xMatchFound != pdFALSE )
    {
        if( ( uxControlBits & eventCLEAR_EVENTS_ON_EXIT_BIT ) != 0U )
        {
            uxBitsToClear |= uxBitsWaitedFor;
        }

        vTaskRemoveFromUnorderedEventList(
            pxListItem,
            pxEventBits->uxEventBits |
                eventUNBLOCKED_DUE_TO_BIT_SET );
    }

    pxListItem = pxNext;
}

pxEventBits->uxEventBits &= ~uxBitsToClear;
```

不能唤醒一个任务就立刻清它的 bits，否则后面的 waiter 会看到被前一个任务修改过的条件。源码先让所有 waiter 针对同一份 set 后快照判断，累计全部 clear mask，扫描结束后统一清除。多个 waiters 因此可以被同一次 set 同时解除。

遍历前保存 `pxNext`，因为当前 item 可能在 `vTaskRemoveFromUnorderedEventList()` 中离开 event list 并进入 ready/pending ready；删除后再读 `pxListItem->pxNext` 会跟到另一个容器。

扫描全部 waiter 的执行时间随等待任务数增长，这也是普通 `xEventGroupSetBits()` 不能直接放进 ISR 的原因。

## Event Group FromISR 把无界扫描转交 Timer daemon

[`xEventGroupSetBitsFromISR()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/event_groups.c#L815-L833) 没有在中断里操作 waiter list，而是调用：

```c
xTimerPendFunctionCallFromISR(
    &vEventGroupSetBitsCallback,
    ( void * ) xEventGroup,
    ( uint32_t ) uxBitsToSet,
    pxHigherPriorityTaskWoken );
```

Timer command queue 接收一个 deferred callback，Timer daemon 稍后在任务上下文调用 `xEventGroupSetBits()` 完成扫描。FromISR 返回成功只表示命令成功入队，不表示 bits 已经同步写入，也不表示 waiter 已经解除。

这与 task notification FromISR 形成清晰对比：notification 已知唯一目标 TCB，ISR 可以在有界短路径中直接更新；Event Group 一次 set 可能匹配任意数量 waiter，只能延迟到任务上下文处理。

两种机制的源码边界最终取决于等待关系放在哪里。Notification 把 value/state 固定在目标 TCB，发送成本与等待者数量无关；Event Group 把共享 bits 放在独立对象，把每个任务的 mask/flags 放进事件节点，set 时必须遍历匹配。理解这个数据归属，比记住“哪个更快”更能解释它们各自的行为。