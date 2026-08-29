---
title: "嵌入式知识体系 · Linux 驱动开发实战 #20 · RTC、NVMEM、EEPROM 与板级数据"
description: "区分 RTC 时间状态与 NVMEM 持久化数据，使用具名 cell 管理序列号、MAC 和校准参数。"
pubDate: "2026-08-29"
series: linux-driver
order: 20
tags: ["Linux Driver", "RTC", "NVMEM", "EEPROM"]
draft: true
---

RTC 保存会变化的时间，EEPROM 保存掉电后保持的字节，NVMEM 则是 Linux 为 EEPROM、OTP、eFuse 等介质提供的统一 provider/cell 模型。它们都“掉电不丢”，用途却不同。

## 1. RTC class 表达时间和 alarm

RTC 驱动注册 `rtc_device` 并实现 `read_time`、`set_time`、`read_alarm` 等操作。用户通过 `/dev/rtcX`、`hwclock` 和 sysfs 使用它。

```sh
cat /sys/class/rtc/rtc0/name
hwclock --show
date
```

系统启动可从 RTC 恢复粗略时间，网络同步后再校正。RTC 电池掉电、首次生产或振荡器误差都会让时间不可信，因此安全日志不能仅凭 RTC 非零就认定时间正确。

## 2. NVMEM provider 暴露介质

EEPROM、OTP controller 或特定 flash 区域可以注册为 NVMEM provider。设备树再把地址范围划成具名 cell：

```dts
eeprom@50 {
    compatible = "atmel,24c02";
    reg = <0x50>;
    read-only;

    #address-cells = <1>;
    #size-cells = <1>;

    serial: serial@0 { reg = <0x00 0x10>; };
    mac0: mac@10 { reg = <0x10 0x06>; };
    calibration: calibration@20 { reg = <0x20 0x40>; };
};
```

consumer 引用 cell 名称，不再散布 offset：

```c
cell = devm_nvmem_cell_get(dev, "calibration");
buf = nvmem_cell_read(cell, &len);
if (IS_ERR(buf))
    return PTR_ERR(buf);
```

读取结果由调用者释放。驱动先验证长度、magic、版本、CRC 和数值范围，再应用到硬件。

## 3. 数据格式是跨阶段协议

序列号、MAC 和校准块要同时被工装、Bootloader、Linux 和应用理解。记录应规定字节序、长度、版本和完整性。全 0、全 FF、截断或未知版本不能默认为有效值。

EEPROM 有页写大小、写周期和寿命限制；正常产品系统通常只读消费，写入由受控量产流程完成。eFuse/OTP 的不可逆写入不属于本章实验。

## 4. 分别验证时间和身份

RTC 实验包括断主电保留、重启读时和 alarm 唤醒；NVMEM 实验读取 cell 并与生产记录比对。不要用一个“读取成功”混合证明两套机制。

下一篇进入 DMA：数据不再只是由 CPU 读取，设备也要直接访问内存，地址和所有权因此变得更复杂。

## 5. consumer 读取后要拥有并验证数据

`nvmem_cell_read()` 返回动态分配的 buffer，consumer 检查长度并复制到自己的对象：

```c
buf = nvmem_cell_read(cell, &len);
if (IS_ERR(buf))
    return PTR_ERR(buf);
if (len != ETH_ALEN || !is_valid_ether_addr(buf)) {
    kfree(buf);
    return -EINVAL;
}
ether_addr_copy(mac, buf);
kfree(buf);
```

序列号不能直接对原始字节调用 `strlen()`；固定长度字段可能没有 NUL。校准块应包含 magic、layout version、payload length 和 CRC，并确认它属于当前 sensor/module revision。

## 6. 写入流程与运行时读取分开

EEPROM 写入受 page size、write-cycle 和掉电影响。量产流程可以先写 staging record，读回验证后再写 commit marker；正常 rootfs 则保持 provider 或节点只读。这样中途掉电留下“未提交记录”，而不是看似有效的半份身份。

建立数据字典时，为每个 cell 记录 offset、长度、字节序、版本、默认/无效模式和写入责任方。冷启动、Bootloader、Linux 和应用读取到的 MAC/serial 应一致。日志可以记录来源和版本，不应打印密钥或完整敏感身份材料。

RTC 与 NVMEM 的联合验收包括：断主电后 RTC 按电池能力保持，EEPROM 身份不变；rootfs 升级不覆盖 cell；无效 CRC 会产生明确错误或受控默认值，而不是继续应用随机数据。

## 7. 参考资料

- [RTC subsystem](https://docs.kernel.org/driver-api/rtc.html)
- [NVMEM subsystem](https://docs.kernel.org/driver-api/nvmem.html)
- [野火：RTC 子系统](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_rtc_subsystem.html)
