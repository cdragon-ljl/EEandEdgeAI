---
title: "FreeRTOS 内核源码解读 02：TCB、任务创建与删除"
description: "沿 FreeRTOS-Kernel V11.3.0 的 tasks.c 追踪 TCB 分配、字段初始化、初始栈构造、进入 ready list 与删除回收。"
pubDate: "2026-08-23"
series: freertos
order: 2
tags: ["FreeRTOS", "Kernel", "TCB", "Task", "Source Code"]
draft: false
---

# FreeRTOS 内核源码解读 02：TCB、任务创建与删除

调用 `xTaskCreate()` 时，应用传入的是函数、名字、栈深度、参数和优先级；调度器真正操作的却是 `TCB_t`。两者之间不是一次简单的内存分配，而是一条有严格可见性边界的构造链：先取得 TCB 与栈，完成所有字段和初始上下文，再把状态节点加入 ready list。删除则沿相反方向撤销可调度性，并根据任务是否仍在使用自己的栈决定立即回收还是交给 Idle task 延迟回收。

本篇固定使用 **FreeRTOS-Kernel V11.3.0**，commit `9b777ae5c5b8e9e456065a00294d1e5f5f9facf5`。只讨论公共任务对象和单核主线；具体处理器如何布置初始寄存器帧留给移植文章。

## TaskHandle_t 背后就是一个可变的 TCB

`TaskHandle_t` 对应用隐藏了 TCB 布局，但内核最终只是把 `TCB_t *` 转成句柄返回。理解任务生命周期，必须先看 [`tasks.c` 中的 TCB 定义](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L370-L450)。下面保留影响本篇主线的字段，省略与 trace、通知和可选扩展有关的条件字段。

```c
/* 以下中文注释为本文添加；字段顺序来自 V11.3.0。 */
typedef struct tskTaskControlBlock
{
    volatile StackType_t * pxTopOfStack; /* 必须是第一个成员，供 port 快速取栈顶。 */

    ListItem_t xStateListItem;           /* 所在链表表达 Ready/Blocked/Suspended 等状态。 */
    ListItem_t xEventListItem;           /* 同时等待 queue、semaphore 等事件时使用。 */
    UBaseType_t uxPriority;
    StackType_t * pxStack;               /* 栈内存基址，删除时需要。 */
    char pcTaskName[ configMAX_TASK_NAME_LEN ];

    #if ( configUSE_MUTEXES == 1 )
        UBaseType_t uxBasePriority;
        UBaseType_t uxMutexesHeld;
    #endif

    #if ( tskSTATIC_AND_DYNAMIC_ALLOCATION_POSSIBLE != 0 )
        uint8_t ucStaticallyAllocated;   /* 记录 TCB 和栈各自由谁拥有。 */
    #endif
} TCB_t;
```

`pxTopOfStack` 必须位于第一个成员，不是编码风格偏好，而是 portable 层与公共内核的 ABI 契约。上下文保存代码只要拿到 TCB 地址，就能在偏移零的位置写回任务栈顶。`pxStack` 的作用不同，它指向整块栈内存的基址，主要用于边界检查和释放。

两个 `ListItem_t` 让同一个 TCB 同时参与两种关系。`xStateListItem` 只能属于一条状态链表；`xEventListItem` 可以同时挂在某个对象的事件等待链表上。于是一个阻塞任务通常同时具有“何时超时”和“等待哪个事件”两条索引，而不是在 TCB 中保存一个能覆盖所有情况的状态枚举。

TCB 的完整大小由配置决定。打开 mutex、task notification、runtime stats 或其他能力会增加字段。静态创建 API 使用 `StaticTask_t` 为调用者提供足够且对齐的存储，但应用不应依赖这个占位类型内部的 dummy 字段去访问真实 TCB。

## 静态创建和动态创建只在内存来源上分叉

创建入口有两条常用路径：`xTaskCreate()` 在内核内部申请 TCB 和栈，`xTaskCreateStatic()` 接收调用者提供的 `StaticTask_t` 与 `StackType_t` 数组。两条路径最终都会调用 `prvInitialiseNewTask()`，然后进入 `prvAddNewTaskToReadyList()`。

```mermaid
sequenceDiagram
    participant App as 应用
    participant Create as 创建入口
    participant Memory as TCB / Stack 存储
    participant Init as prvInitialiseNewTask
    participant Ready as prvAddNewTaskToReadyList

    App->>Create: 函数、名字、栈深度、参数、优先级
    Create->>Memory: 动态申请或接收静态缓冲
    Memory->>Init: 尚未公开的 TCB
    Init->>Init: 字段、链表节点、初始栈
    Init->>Ready: 完整 TCB
    Ready->>Ready: 加入对应优先级 ready list
```

[`xTaskCreateStatic()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L1332-L1366) 不会复制调用者提供的两块存储。`pxTaskBuffer` 直接被解释为 TCB，`puxStackBuffer` 直接写入 `pxStack`。只要任务仍存在，应用就必须保证这两块内存持续有效。

动态路径集中在 [`prvCreateTask()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L1642-L1738)。分配顺序受 `portSTACK_GROWTH` 影响：

```c
#if ( portSTACK_GROWTH > 0 )
{
    pxNewTCB = ( TCB_t * ) pvPortMalloc( sizeof( TCB_t ) );

    if( pxNewTCB != NULL )
    {
        pxNewTCB->pxStack = ( StackType_t * )
            pvPortMallocStack( ( size_t ) uxStackDepth * sizeof( StackType_t ) );

        if( pxNewTCB->pxStack == NULL )
        {
            vPortFree( pxNewTCB );
            pxNewTCB = NULL;
        }
    }
}
#else
{
    StackType_t * pxStack = ( StackType_t * )
        pvPortMallocStack( ( size_t ) uxStackDepth * sizeof( StackType_t ) );

    if( pxStack != NULL )
    {
        pxNewTCB = ( TCB_t * ) pvPortMalloc( sizeof( TCB_t ) );

        if( pxNewTCB != NULL )
        {
            pxNewTCB->pxStack = pxStack;
        }
        else
        {
            vPortFreeStack( pxStack );
        }
    }
}
#endif
```

源码注释给出的理由很直接：栈向高地址增长时先放 TCB，再放栈；栈向低地址增长时先放栈，再放 TCB，降低栈越界立即侵入 TCB 的风险。这不是内存安全保证，只是分配顺序上的防御。

无论哪一块分配失败，已经取得的另一块都要立即释放，半成品不会进入初始化函数。两块都成功后，如果静态和动态创建可以同时存在，TCB 会记录 `tskDYNAMICALLY_ALLOCATED_STACK_AND_TCB`；静态路径则记录 `tskSTATICALLY_ALLOCATED_STACK_AND_TCB`。这个标记直到删除时才真正发挥作用。

## prvInitialiseNewTask 把内存变成可恢复的任务

`prvInitialiseNewTask()` 的职责不是把整个 TCB 清零。内存清零发生在创建路径中；初始化函数根据配置和传入参数建立任务必须满足的语义。

首先计算并对齐初始栈顶。栈向低地址增长时，从缓冲区最后一个 `StackType_t` 开始向下对齐；栈向高地址增长时，从缓冲区起点向上对齐。这里计算出的只是交给 port 的可用端点，还不是最终 `pxTopOfStack`。

随后写入名字和优先级。名字最多复制 `configMAX_TASK_NAME_LEN` 个字符，并强制最后一个字节为 `\0`。优先级先经过 `configASSERT`，release 构建中即使 assert 被移除，超出范围的值仍会被钳制到 `configMAX_PRIORITIES - 1`。

链表节点在这里完成与 TCB 的双向绑定：

```c
vListInitialiseItem( &( pxNewTCB->xStateListItem ) );
vListInitialiseItem( &( pxNewTCB->xEventListItem ) );

listSET_LIST_ITEM_OWNER( &( pxNewTCB->xStateListItem ), pxNewTCB );

listSET_LIST_ITEM_VALUE(
    &( pxNewTCB->xEventListItem ),
    ( TickType_t ) configMAX_PRIORITIES - ( TickType_t ) uxPriority );
listSET_LIST_ITEM_OWNER( &( pxNewTCB->xEventListItem ), pxNewTCB );
```

固定实现见 [`tasks.c`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L1816-L1942)。状态节点此时还没有 container，因为任务尚未进入任何全局状态链表；事件节点提前写入反向优先级值，后续加入事件等待链表时不必重复计算。

最后，公共层调用 `pxPortInitialiseStack()`。它传入栈端点、任务函数和 `pvParameters`，port 返回真正可恢复的栈顶并写入 TCB：

```c
pxNewTCB->pxTopOfStack =
    pxPortInitialiseStack( pxTopOfStack, pxTaskCode, pvParameters );
```

不同 port 可能因为栈边界检查或保护能力拥有更多参数，但公共契约不变：返回的栈顶必须让调度器第一次恢复该任务时，从 `pxTaskCode( pvParameters )` 开始执行。

如果应用要求返回句柄，`*pxCreatedTask` 也在初始化函数末尾写成 `pxNewTCB`。此时调用者已经能得到地址，但内核仍未把任务放进 ready list；真正的全局可见性边界在下一个函数。

## 进入 ready list 是任务对象的发布动作

动态创建入口 [`xTaskCreate()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L1741-L1775) 本身很短：`prvCreateTask()` 成功后调用 `prvAddNewTaskToReadyList()`，否则返回 `errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY`。静态入口也使用同一个发布函数。

单核实现中的 [`prvAddNewTaskToReadyList()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L2050-L2126) 在 critical section 中完成以下操作：

```c
taskENTER_CRITICAL();
{
    uxCurrentNumberOfTasks++;

    if( pxCurrentTCB == NULL )
    {
        pxCurrentTCB = pxNewTCB;

        if( uxCurrentNumberOfTasks == 1U )
        {
            prvInitialiseTaskLists();
        }
    }
    else if( xSchedulerRunning == pdFALSE )
    {
        if( pxCurrentTCB->uxPriority <= pxNewTCB->uxPriority )
        {
            pxCurrentTCB = pxNewTCB;
        }
    }

    uxTaskNumber++;
    traceTASK_CREATE( pxNewTCB );
    prvAddTaskToReadyList( pxNewTCB );
    portSETUP_TCB( pxNewTCB );
}
taskEXIT_CRITICAL();
```

第一个任务触发 `prvInitialiseTaskLists()`，因为 ready、delayed、pending ready 等全局链表此前还没有初始化。调度器启动前，`pxCurrentTCB` 始终指向目前创建过的最高优先级任务，为首任务启动做准备。

`prvAddTaskToReadyList` 最终把 `xStateListItem` 插入 `pxReadyTasksLists[uxPriority]`。从这一刻起，调度器可以通过链表找到 TCB，任务对象才算正式发布。构造字段、初始栈和 owner 必须全部在此之前完成。

如果调度器已经运行，函数离开 critical section 后再判断新任务是否需要触发抢占。切换请求放在链表更新之后，确保调度器即使马上选择新任务，也只能看到完整 TCB。

## 删除不是创建过程的简单倒放

`vTaskDelete()` 首先在 critical section 中取得目标 TCB，然后把状态节点从 ready、delayed 或 suspended list 移除。如果任务还在等待某个事件，`xEventListItem` 也必须从对应事件链表删除。

```c
if( uxListRemove( &( pxTCB->xStateListItem ) ) == 0U )
{
    taskRESET_READY_PRIORITY( pxTCB->uxPriority );
}

if( listLIST_ITEM_CONTAINER( &( pxTCB->xEventListItem ) ) != NULL )
{
    ( void ) uxListRemove( &( pxTCB->xEventListItem ) );
}
```

固定实现见 [`vTaskDelete()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L2222-L2369)。节点移除后，任务已经不可能再次被调度；但内存能否马上释放，取决于 CPU 是否仍在使用该任务的栈。

删除未运行任务时，内核可以在退出 critical section 后直接调用 `prvDeleteTCB()`。删除当前任务则不同：`vTaskDelete(NULL)` 执行期间，函数调用帧、局部变量和返回地址都还位于当前任务栈上。如果此时释放栈，正在执行的删除代码会立刻踩在已释放内存上。

因此，运行中的任务只会进入 `xTasksWaitingTermination`：

```c
vListInsertEnd( &xTasksWaitingTermination,
                &( pxTCB->xStateListItem ) );
++uxDeletedTasksWaitingCleanUp;
xDeleteTCBInIdleTask = pdTRUE;
```

任务随后请求一次切换，真正离开自己的栈。Idle task 周期性调用 [`prvCheckTasksWaitingTermination()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L6110-L6183)，从 termination list 取出已经不再运行的 TCB，更新任务计数，再在 critical section 外调用 `prvDeleteTCB()`。

最终释放策略由创建时记录的内存所有权决定。[`prvDeleteTCB()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/tasks.c#L6471-L6523) 先执行 port 和 C runtime 清理，然后处理三种情况：

- TCB 与栈都动态分配：分别调用 `vPortFreeStack()` 和 `vPortFree()`；
- 栈由应用静态提供、TCB 动态分配：只释放 TCB；
- TCB 与栈都静态提供：两块内存都不释放。

这也是为什么 `ucStaticallyAllocated` 不是“是否静态”的布尔值，而是能区分三种所有权组合的枚举标记。

从创建到删除，真正保持一致的不是某个 API 返回值，而是对象发布与撤销的顺序：内存先于字段，字段先于初始上下文，完整 TCB 先于 ready list；删除时先撤销链表成员身份，当前任务先切离自己的栈，最后才按所有权释放内存。只要顺序被破坏，即使 TCB 每个字段看上去都正确，系统仍会在并发调度或回收阶段失败。