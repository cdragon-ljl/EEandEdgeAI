---
title: "Linux BSP 开发实战系列框架"
description: "以 RV1126 为主线，覆盖板级 bring-up、启动链、设备树、rootfs、系统维护、OTA 与量产交付。"
pubDate: "2026-08-27"
series: bsp
order: 0
tags: ["Linux BSP", "Board Bring-up", "System Integration"]
draft: true
---

# Linux BSP 开发实战系列框架

## 系列边界

BSP 系列回答的是“如何把一块板从上电推进到可维护、可升级、可量产的系统”。内容保留启动链、SDK 构建、U-Boot、内核与设备树基础，以及 rootfs、服务、系统加固、内核维护、OTA 和整机交付。

Linux 内核设备模型、总线、具体外设和驱动子系统已经独立到“Linux 驱动开发实战”，BSP 文章只保留理解板级硬件描述所必需的设备树基础。

`mermaid
flowchart LR
    A[开发环境与 SDK] --> B[烧录与启动日志]
    B --> C[U-Boot]
    C --> D[Linux 内核与设备树]
    D --> E[rootfs 与系统服务]
    E --> F[维护 / OTA / 量产]
`

## 四个阶段

1. BSP 全景、环境、构建、烧录与硬件调试；
2. U-Boot 配置、源码启动流程与板级参数；
3. Linux 内核、启动日志与设备树基础；
4. rootfs、系统服务、系统加固、维护、OTA 与综合交付。

## 篇目顺序

| 顺序 | 主题 | 文件 |
|---:|:---|:---|
| 1 | 从 MCU 到 Linux：BSP 到底在做什么 | `bsp-01-linux-bsp-what-is-it-detailed.md` |
| 2 | 从上电到 Shell：RV1126 启动链路全流程 | `bsp-02-rv1126-boot-flow-power-on-to-shell.md` |
| 3 | 开发环境搭建与 SDK 首次编译：工具链、Git 与产物归档 | `bsp-03-env-sdk-first-build.md` |
| 4 | 烧录、串口、原理图与仪器调试：拿到第一条启动日志 | `bsp-04-flash-uart-schematic-instrument-debug.md` |
| 5 | Rockchip SDK 构建体系拆解：build、分区、打包与发布产物 | `bsp-05-rockchip-sdk-build-system.md` |
| 6 | U-Boot 在嵌入式 Linux 里的位置 | `bsp-06-uboot-role-in-embedded-linux.md` |
| 7 | U-Boot 配置与编译：defconfig、环境变量与启动参数 | `bsp-07-uboot-config-build.md` |
| 8 | U-Boot 启动流程源码导读：从入口到跳转内核 | `bsp-08-uboot-source-boot-flow.md` |
| 9 | U-Boot 设备树与板级参数：从硬件描述到 DTB 传递 | `bsp-09-uboot-device-tree-board-parameters.md` |
| 10 | U-Boot 常用调试与自定义命令 | `bsp-10-uboot-debug-custom-commands.md` |
| 11 | Linux 内核编译与配置 | `bsp-11-linux-kernel-build-and-config.md` |
| 12 | 内核启动流程与启动日志 | `bsp-12-linux-boot-flow-and-logs.md` |
| 13 | 设备树基础：DTS、DTSI 与 binding | `bsp-13-device-tree-basics-dts-dtsi-binding.md` |
| 14 | 设备树进阶：pinctrl、clock、reset 与 regulator | `bsp-14-device-tree-pinctrl-clock-reset-regulator.md` |
| 15 | Buildroot 根文件系统构建与集成 | `bsp-15-buildroot-rootfs-integration.md` |
| 16 | 应用自启动、日志与系统服务 | `bsp-16-startup-services-logs.md` |
| 17 | 电源管理、看门狗与系统加固 | `bsp-17-power-management-watchdog-hardening.md` |
| 18 | 内核裁剪、补丁管理与长期维护 | `bsp-18-kernel-maintenance-patch-management.md` |
| 19 | 分区、OTA、版本管理与量产烧录 | `bsp-19-partition-ota-version-manufacturing.md` |
| 20 | 综合项目：从空板到可运行产品 Demo | `bsp-20-end-to-end-product-demo.md` |

## 与 Linux 驱动系列的关系

BSP 负责系统级集成和交付，Linux 驱动负责内核如何绑定、管理和访问硬件。设备树是两者接口：BSP 固化板级硬件事实，驱动通过 compatible、资源和子系统 binding 消费这些事实。