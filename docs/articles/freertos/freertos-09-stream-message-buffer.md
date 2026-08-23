---
title: "FreeRTOS 内核源码解读 09：Stream Buffer 与 Message Buffer"
description: "沿 FreeRTOS-Kernel V11.3.0 的 stream_buffer.c 分析 head/tail、空槽、部分流写入、消息长度头、trigger level 和任务通知唤醒。"
pubDate: "2026-08-23"
series: freertos
order: 9
tags: ["FreeRTOS", "Stream Buffer", "Message Buffer", "Ring Buffer", "Source Code"]
draft: false
---

# FreeRTOS 内核源码解读 09：Stream Buffer 与 Message Buffer

Stream Buffer 和 Message Buffer 共用 `stream_buffer.c`。两者都用 head/tail 管理环形字节区，也都用任务通知让唯一 reader/writer 阻塞和唤醒；真正的分界在消息边界：Stream Buffer 可以只写当前能容纳的部分字节，Message Buffer 必须把长度头和完整 payload 一次提交。

本篇固定使用 **FreeRTOS-Kernel V11.3.0**，commit `9b777ae5c5b8e9e456065a00294d1e5f5f9facf5`。只讨论单 writer、单 reader 的内核契约；需要多个生产者或消费者时，应用必须在调用外部提供串行化。

## StreamBuffer_t 不维护任务链表，只记住一个 reader 和 writer

[`stream_buffer.c`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/stream_buffer.c#L231-L252) 的核心对象如下：

```c
typedef struct StreamBufferDef_t
{
    volatile size_t xTail;
    volatile size_t xHead;
    size_t xLength;
    size_t xTriggerLevelBytes;

    volatile TaskHandle_t xTaskWaitingToReceive;
    volatile TaskHandle_t xTaskWaitingToSend;

    uint8_t * pucBuffer;
    uint8_t ucFlags;
    UBaseType_t uxNotificationIndex;
} StreamBuffer_t;
```

`xHead` 指向下一次写入位置，`xTail` 指向下一次读取位置。实现始终保留一个空字节，因此最大可报告空间是 `xLength - 1`；这让 `head == tail` 只表示空，不需要额外 full flag。

`ucFlags` 区分 stream、message、静态分配和 batching 等模式。Message Buffer 不是另一个结构体，只是设置 message flag 并把每条 payload 前面附加长度头。

对象只保存一个 `xTaskWaitingToReceive` 和一个 `xTaskWaitingToSend`，没有 Queue 那样的多任务事件链表。源码在登记 waiter 时使用 `configASSERT(handle == NULL)`，这正是 single-reader/single-writer 契约的直接体现。

## 环形复制分成两段，但 head/tail 只在完整操作后提交

[`prvWriteBytesToBuffer()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/stream_buffer.c#L1479-L1523) 先计算 head 到缓冲尾部可连续写入的长度：

```c
xFirstLength = configMIN(
    pxStreamBuffer->xLength - xHead, xCount );

memcpy( &( pxStreamBuffer->pucBuffer[ xHead ]),
        pucData,
        xFirstLength );

if( xCount > xFirstLength )
{
    memcpy( pxStreamBuffer->pucBuffer,
            &( pucData[ xFirstLength ] ),
            xCount - xFirstLength );
}

xHead += xCount;
if( xHead >= pxStreamBuffer->xLength )
{
    xHead -= pxStreamBuffer->xLength;
}
return xHead;
```

函数返回新 head，由上层在 payload 或完整 message 写完后一次写入 `pxStreamBuffer->xHead`。读取函数按同样方式从 tail 到末尾、再从开头复制，并返回新 tail。

这种实现依赖单 writer/single reader。writer 只修改 head，reader 只修改 tail；双方可以无锁读取对方索引计算空间/数据量。但两个 writer 会同时基于同一个旧 head 计算并覆盖数据，两个 reader也会同时消费同一段字节。内核不为多方争用添加锁。

## Stream Buffer 写入当前可用部分，Message Buffer 要么整条成功要么不写

[`xStreamBufferSend()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/stream_buffer.c#L808-L940) 同时服务两种模式。函数先计算 `xRequiredSpace`：

```c
size_t xRequiredSpace = xDataLengthBytes;
const size_t xMaxReportedSpace = pxStreamBuffer->xLength - 1U;

if( ( pxStreamBuffer->ucFlags & sbFLAGS_IS_MESSAGE_BUFFER ) != 0U )
{
    xRequiredSpace += sbBYTES_TO_STORE_MESSAGE_LENGTH;

    if( xRequiredSpace > xMaxReportedSpace )
    {
        xTicksToWait = 0U; /* 永远不可能放下，等待也没有意义。 */
    }
}
else if( xRequiredSpace > xMaxReportedSpace )
{
    xRequiredSpace = xMaxReportedSpace;
}
```

Stream 模式把请求上限裁到最大容量，最终 `prvWriteMessageToBuffer()` 再取请求长度与当前空间的较小值，因此可以返回小于 `xDataLengthBytes` 的已写字节数。

Message 模式先加 `sbBYTES_TO_STORE_MESSAGE_LENGTH`。当前空间不足以同时容纳长度头和 payload 时，返回零，不写半条消息；即使整个空 buffer 也放不下，函数直接取消等待。

真正写消息时先把 `configMESSAGE_BUFFER_LENGTH_TYPE` 长度写入临时 head，再写 payload，最后只把 payload 写完后的 head 提交给对象：

```c
if( xSpace >= xRequiredSpace )
{
    xNextHead = prvWriteBytesToBuffer(
        pxStreamBuffer,
        ( const uint8_t * ) &xMessageLength,
        sbBYTES_TO_STORE_MESSAGE_LENGTH,
        xNextHead );
}
else
{
    xDataLengthBytes = 0;
}

if( xDataLengthBytes != 0U )
{
    pxStreamBuffer->xHead = prvWriteBytesToBuffer(
        pxStreamBuffer,
        ( const uint8_t * ) pvTxData,
        xDataLengthBytes,
        xNextHead );
}
```

长度头写入发生在内存中，但 head 尚未公开；只有 payload 复制完成，reader 才能通过新 head 看到整条消息。这是 Message Buffer 原子提交边界。

## writer 用任务通知等待空间，而不是加入对象事件链表

允许阻塞且空间不足时，send 在 critical section 中清除当前任务 notification state，并登记唯一 writer：

```c
xSpace = xStreamBufferSpacesAvailable( pxStreamBuffer );

if( xSpace < xRequiredSpace )
{
    xTaskNotifyStateClearIndexed(
        NULL, pxStreamBuffer->uxNotificationIndex );

    configASSERT( pxStreamBuffer->xTaskWaitingToSend == NULL );
    pxStreamBuffer->xTaskWaitingToSend = xTaskGetCurrentTaskHandle();
}
```

随后任务调用 `xTaskNotifyWaitIndexed()` 等待 reader 释放空间。恢复后清除 waiter handle，并用 `xTaskCheckForTimeOut()` 更新剩余时间；和 Queue 一样，通知只表示条件可能改变，send 仍要重新计算空间。

默认完成宏分工明确：`sbSEND_COMPLETED` 在写入后检查并通知 `xTaskWaitingToReceive`，`sbRECEIVE_COMPLETED` 在消费后检查并通知 `xTaskWaitingToSend`，两者都会在通知后清空对应 handle。默认宏使用 notification value 无关的唤醒方式；如果启用 `configUSE_SB_COMPLETED_CALLBACK`，对象可以保存自定义 send/receive completed callback。

Stream Buffer 通常不需要 writer 等待“整条空间”，它可以写入部分数据；Message Buffer 必须等到 `xRequiredSpace` 全部可用。因此 `xTaskWaitingToSend` 的注释特别强调 full message buffer 场景。

## trigger level 决定何时唤醒 reader，不决定 receive 最多读多少

send 成功后，只有 buffer 内字节数达到 `xTriggerLevelBytes` 才调用 `prvSEND_COMPLETED()` 唤醒 reader：

```c
if( prvBytesInBuffer( pxStreamBuffer ) >=
    pxStreamBuffer->xTriggerLevelBytes )
{
    prvSEND_COMPLETED( pxStreamBuffer );
}
```

Trigger level 是阻塞唤醒阈值，不是 message 长度，也不是每次 receive 的固定读取量。reader 已经运行时，`xStreamBufferReceive()` 仍根据当前可用字节和用户缓冲长度决定实际返回值。

普通 Stream Buffer receive 只要至少一个字节就可以返回；batching flag 打开时，阻塞判断会要求可用字节超过 trigger level。Message Buffer 则要求至少存在长度头和一个 payload 字节。

reader 的 lost wakeup 防护与 notification wait 一致：在 critical section 内同时检查可用数据、清 notification state、登记 `xTaskWaitingToReceive`；send 若在此前完成，reader 看见数据不阻塞；send 若在登记后完成，completed 宏通知准确的目标任务。

## Message Buffer 先窥视长度，用户缓冲不足时不消费消息

[`prvReadMessageFromBuffer()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/stream_buffer.c#L1279-L1331) 用局部 `xNextTail` 读取长度头，但不立即提交 `pxStreamBuffer->xTail`：

```c
size_t xNextTail = pxStreamBuffer->xTail;

xNextTail = prvReadBytesFromBuffer(
    pxStreamBuffer,
    ( uint8_t * ) &xTempNextMessageLength,
    sbBYTES_TO_STORE_MESSAGE_LENGTH,
    xNextTail );

xNextMessageLength = ( size_t ) xTempNextMessageLength;

if( xNextMessageLength > xBufferLengthBytes )
{
    xNextMessageLength = 0;
}

xCount = configMIN( xNextMessageLength, xBytesAvailable );

if( xCount != 0U )
{
    pxStreamBuffer->xTail = prvReadBytesFromBuffer(
        pxStreamBuffer,
        ( uint8_t * ) pvRxData,
        xCount,
        xNextTail );
}
```

用户缓冲不足时 `xCount == 0`，真实 tail 没有变化，长度头和 payload 都仍在环中。调用者可以先用 `xStreamBufferNextMessageLengthBytes()` 查看下一条长度，准备足够缓冲后重试。

Stream 模式没有长度头，receive 直接读取 `min(xBufferLengthBytes, xBytesAvailable)`，允许一次消费任意部分字节流。

成功 receive 后 `sbRECEIVE_COMPLETED` 通知等待空间的 writer。FromISR send/receive 使用对应 completed-from-ISR 宏，通过 `pxHigherPriorityTaskWoken` 把唤醒结果交给中断退出。

## single-writer/single-reader 是无锁正确性的前提

头尾索引分属两侧、waiter 只有一个、notification 直接指向唯一任务，这些设计共同换取了比 Queue 更小的对象和更短路径。代价是内核不仲裁多个 writer 或多个 reader。

如果应用确实需要多 writer，可以在所有 send 外使用同一 mutex/critical discipline；多 reader 同理。只保护某一次 memcpy 不够，因为空间检查、等待登记、timeout 重试和 head/tail 提交必须由同一个串行化范围覆盖。

Stream Buffer 与 Message Buffer 的源码差异最终只有两点：是否允许部分写入，以及是否在 payload 前保存长度头。环形复制、notification waiter 和 completed 回调都共享同一实现。理解 head/tail 的提交时机，就能解释消息为什么不会半写、缓冲不足为什么不丢消息，以及 trigger level 为什么只影响唤醒而不改变数据边界。