---
title: "FreeRTOS 内核源码解读 10：软件定时器与 Timer daemon"
description: "沿 FreeRTOS-Kernel V11.3.0 的 timers.c 分析 command queue、Timer_t、active/overflow list、daemon 等待、到期和 callback。"
pubDate: "2026-08-23"
series: freertos
order: 10
tags: ["FreeRTOS", "Software Timer", "Timer Daemon", "Source Code"]
draft: false
---

# FreeRTOS 内核源码解读 10：软件定时器与 Timer daemon

调用 `xTimerStart()` 返回成功，不代表 timer 已进入 active list，更不代表 callback 已执行。任务和 ISR 只把命令写入 `xTimerQueue`；唯一真正修改 Timer 对象状态和 active lists 的执行者是 Timer daemon task。软件定时器因此是一套消息驱动的延迟执行系统，而不是在调用者上下文直接设置一条超时链表。

本篇固定使用 **FreeRTOS-Kernel V11.3.0**，commit `9b777ae5c5b8e9e456065a00294d1e5f5f9facf5`。只讨论内核 daemon、命令和 Tick 语义，不绑定具体硬件定时器。

## Timer_t 保存配置和链表节点，运行状态由 daemon 独占

[`timers.c`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/timers.c#L75-L118) 的 timer 对象包含：

```c
typedef struct tmrTimerControl
{
    const char * pcTimerName;
    ListItem_t xTimerListItem;
    TickType_t xTimerPeriodInTicks;
    void * pvTimerID;
    TimerCallbackFunction_t pxCallbackFunction;
    uint8_t ucStatus;
} Timer_t;
```

`xTimerListItem.xItemValue` 保存下一次 expiry tick，owner 指回 `Timer_t`。`ucStatus` 记录 active、auto reload 和静态分配等标志；是否位于 active list 还能通过 list item container 判断。

软件 timer callback 不在 Tick ISR 中运行，也不在 `xTimerStart()` 调用者中运行。Daemon task 串行处理命令、移除/插入 timer list item 并调用 callback，因此对象状态修改天然集中在一个任务上下文。

全局状态包括两条 active lists 和一条 command queue：

```c
static List_t xActiveTimerList1;
static List_t xActiveTimerList2;
static List_t * pxCurrentTimerList;
static List_t * pxOverflowTimerList;
static QueueHandle_t xTimerQueue = NULL;
```

两条 list 与任务 delayed lists 使用同样的 Tick 回绕思想：当前周期和下一周期的绝对 expiry 分开排序。

## xTimerGenericCommand 只冻结命令参数并入队

公开宏 `xTimerStart`、`xTimerReset`、`xTimerStop`、`xTimerChangePeriod` 和 `xTimerDelete` 最终进入 `xTimerGenericCommand`，再根据 command ID 路由到 task 或 FromISR 版本。

[`xTimerGenericCommandFromTask()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/timers.c#L448-L493) 构造 `DaemonTaskMessage_t`：

```c
xMessage.xMessageID = xCommandID;
xMessage.u.xTimerParameters.xMessageValue = xOptionalValue;
xMessage.u.xTimerParameters.pxTimer = xTimer;

if( xCommandID < tmrFIRST_FROM_ISR_COMMAND )
{
    xReturn = xQueueSendToBack(
        xTimerQueue, &xMessage, xTicksToWait );
}
```

Start/reset 命令的 optional value 是命令发出时的 Tick。这个时间戳不能在 daemon 收到消息后才重新采样，否则高优先级任务、拥塞 queue 或长 callback 导致的处理延迟会悄悄延长 timer 首周期。

Change period 命令的 optional value 是新 period；daemon 处理时以当前时间作为新周期起点。Stop/delete 不需要 expiry 参数。

[`xTimerGenericCommandFromISR()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/timers.c#L497-L535) 使用 `xQueueSendToBackFromISR()`，不阻塞，通过 `pxHigherPriorityTaskWoken` 反映是否唤醒了 daemon。API 返回 pdPASS 只表示命令成功进入 `xTimerQueue`。Queue 满时命令会失败，timer 对象保持 daemon 最后提交的状态。

## Timer daemon 在“最近到期”和“新命令”之间等待

[`prvTimerTask()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/timers.c#L744-L775) 是一个永久循环：

```c
for( ; ; )
{
    xNextExpireTime = prvGetNextExpireTime( &xListWasEmpty );

    prvProcessTimerOrBlockTask(
        xNextExpireTime, xListWasEmpty );

    prvProcessReceivedCommands();
}
```

当前 active list 按 expiry 排序，头部就是最近到期 timer。若已经到期，daemon 立即处理；否则调用 `vQueueWaitForMessageRestricted()` 阻塞，等待时间为 `xNextExpireTime - xTimeNow`，同时监听 command queue。新命令到来会提前唤醒 daemon 重新计算 active list。

判断和阻塞之间使用 scheduler suspended 窗口，避免 timer 刚到期或命令刚入队时 daemon 错过条件。`vQueueWaitForMessageRestricted` 只给 Timer daemon 这种受控场景使用。

如果当前 timer list 为空，daemon 仍要在 Tick 回绕时醒来，因为 overflow list 中可能存在下一周期 timer。`prvGetNextExpireTime()` 在 current list 为空时返回零，等待逻辑结合 overflow list 是否为空决定是否允许无限等待。

## 插入 active list 必须同时考虑命令时间和 Tick 回绕

[`prvInsertTimerInActiveList()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/timers.c#L890-L931) 收到四个时间量：timer、目标 expiry、daemon 当前时间和命令发出时间。

```c
listSET_LIST_ITEM_VALUE(
    &( pxTimer->xTimerListItem ), xNextExpiryTime );
listSET_LIST_ITEM_OWNER(
    &( pxTimer->xTimerListItem ), pxTimer );

if( xNextExpiryTime <= xTimeNow )
{
    if( ( TickType_t ) ( xTimeNow - xCommandTime ) >=
        pxTimer->xTimerPeriodInTicks )
    {
        xProcessTimerNow = pdTRUE;
    }
    else
    {
        vListInsert(
            pxOverflowTimerList, &( pxTimer->xTimerListItem ) );
    }
}
else
{
    if( ( xTimeNow < xCommandTime ) &&
        ( xNextExpiryTime >= xCommandTime ) )
    {
        xProcessTimerNow = pdTRUE;
    }
    else
    {
        vListInsert(
            pxCurrentTimerList, &( pxTimer->xTimerListItem ) );
    }
}
```

只比较 `expiry <= now` 无法区分“真的已经过期”和“expiry 已回绕到下一周期”。源码结合 command time 判断 Tick 是否在命令发出到处理之间回绕，以及从 command time 到 now 是否已经至少经过一个 period。

如果 daemon 因 queue backlog 或 callback 太长而晚于 expiry 处理 start/reset，函数返回 `xProcessTimerNow = pdTRUE`，命令处理路径立即执行 callback，而不是把已过期 timer 错放进未来 list。

## 到期处理先更新 active 状态，再执行 callback

[`prvProcessExpiredTimer()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/timers.c#L714-L741) 从 current list 头部取得 owner，先删除 list item：

```c
Timer_t * const pxTimer =
    ( Timer_t * ) listGET_OWNER_OF_HEAD_ENTRY( pxCurrentTimerList );

uxListRemove( &( pxTimer->xTimerListItem ) );

if( ( pxTimer->ucStatus & tmrSTATUS_IS_AUTORELOAD ) != 0U )
{
    prvReloadTimer( pxTimer, xNextExpireTime, xTimeNow );
}
else
{
    pxTimer->ucStatus &= ~tmrSTATUS_IS_ACTIVE;
}

pxTimer->pxCallbackFunction( ( TimerHandle_t ) pxTimer );
```

One-shot timer 在 callback 前清除 active 标志。Auto-reload timer 则从上一 expiry 加 period 计算下一次 expiry，不从 callback 执行结束时间重新起算，因此保留周期相位。

`prvReloadTimer()` 使用 while 循环重新插入。如果 daemon 已经落后多个周期，下一 expiry 仍在过去，源码会推进 expiry 并再次调用 callback，直到得到未来 expiry。这种 catch-up 行为意味着长时间阻塞 daemon 后可能连续执行同一 auto-reload callback 多次。

所有 callback 都在同一个 Timer daemon task 中串行执行。Callback 阻塞、等待自身依赖的 timer command 或执行长计算，会推迟所有 timer 到期和 command 处理。常见做法是在 callback 中只更新短状态或向业务任务发送消息，把长工作移出 daemon。

## command 处理先移除旧 list item，再按命令重新提交

[`prvProcessReceivedCommands()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/timers.c#L934-L1065) 持续 `xQueueReceive(..., tmrNO_DELAY)` 清空命令队列。对于 timer command，若对象当前位于某条 active list，先移除旧节点，再采样 daemon 当前时间并执行 switch。

Start/reset 把 active 标志置位，用“命令时间 + period”计算 expiry；若插入函数判断已经到期，则立即 callback，并按 auto-reload 状态决定是否继续装载。

Stop 只清 active 标志，旧 list item 已在 switch 前移除。Change period 更新 period，以 daemon 当前时间为新起点插回 list。Delete 在动态对象上调用 `vPortFree()`，静态 timer 则只清状态，不释放应用存储。

负数 message ID 不表示 timer command，而是 `xTimerPendFunctionCall` 请求。Daemon 从 union 中取得 callback 和两个参数直接调用；Event Group FromISR 的 set/clear 正是通过这条 deferred function 路径把无界扫描移出 ISR。

## Tick 回绕时先处理旧周期剩余 timer，再交换 lists

`prvSampleTimeNow()` 保存上次采样 Tick。当前值小于上次值时，说明发生回绕，调用 `prvSwitchTimerLists()`。

切换前，源码处理 current list 中所有剩余 timer，使用 `tmrMAX_TIME_BEFORE_OVERFLOW` 作为旧周期边界。理论上这些 timer 都已到期，只是 daemon 还没来得及处理。清空旧 current list 后交换 `pxCurrentTimerList/pxOverflowTimerList`，新周期 timer 立即成为当前排序集合。

这个过程与任务 delayed lists 相似，但 Timer daemon 自己负责检测和处理；Tick ISR 不遍历软件 timer list，也不直接调用 callback。

软件定时器的时间语义由三个时刻共同决定：命令发出时间、daemon 处理时间和目标 expiry。把 API 返回时刻当成 timer 已启动，会忽略 command queue 延迟；把 callback 完成时刻当成 auto-reload 新起点，会忽略相位保持和 catch-up。只有沿 command queue、active list 和 daemon loop 连起来，才能解释 timer 的真实行为。