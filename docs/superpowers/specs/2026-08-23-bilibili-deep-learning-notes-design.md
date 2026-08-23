# B 站深度学习课程学习笔记系列设计

## 设计状态

- 用户已确认按 `lesson` 合并内容，而不是按视频逐篇整理。
- 笔记同时服务于系统学习和公开发布分享。
- 课程包含 43 个视频，总时长约 15.07 小时；本地包含 28 份 PDF 讲义，覆盖 `lesson1` 至 `lesson27`，其中 `lesson1` 分理论与实操两份。
- 实施采用先完成 `lesson1` 样稿、复核表达与素材对齐、再批量推进 `lesson2` 至 `lesson27` 的方式。

## 目标与边界

最终交付是一套可连续学习、也可单篇发布的中文 Markdown 笔记：

- 1 篇课程总目录；
- 27 篇 lesson 笔记；
- 每篇合并同一 lesson 对应的理论、上下集和实操视频；
- 讲义负责提供结构、公式、图示和代码线索，音频转写负责补充讲师解释、例子、经验和易错点；
- 不把逐字稿直接当正文，不保留口头重复、寒暄和无信息密度的过渡语；
- 不转载完整音频、视频或整页讲义，只引用必要信息并保留 B 站原视频链接和作者归属。

本系列不额外扩写为独立教材，不引入未经核验的实验数据，也不把课程未讲解的主题强行塞入对应 lesson。

## 方案比较

### 方案一：每个视频一篇

输出 43 篇文章。素材映射最直接，但上、下集和理论、实操会被切断，重复导语和上下文较多，不适合形成连续知识体系。

### 方案二：每个 lesson 一篇

输出 27 篇文章，将拆分视频合并到讲义课次。既能保持理论与实操的完整闭环，也适合单篇发布。用户已选择此方案。

### 方案三：按主题合并成长文

输出约 6 至 8 篇长文，例如基础网络、CNN、边缘部署、Transformer、生成模型和强化学习。系列更短，但每篇过长，复习定位和逐课校对困难。

## 素材映射

合集导览视频 `BV1zu7868E5X` 只用于总目录和课程介绍，不单独形成 lesson。

| Lesson | 主题 | 对应视频 |
|:---:|:---|:---|
| 1 | 神经网络基础与 TensorFlow/Keras 入门 | `BV1QFLU6hELC`、`BV13FLU6aEaK`、`BV1LXLm6TEdK` |
| 2 | 深度网络训练技巧 | `BV1v3Li6vE4M`、`BV1R3Li6vEag`、`BV1ajLi6wE1R` |
| 3 | 迁移学习与分类实战 | `BV1hmGa6CEWR`、`BV1hmGa6CEMz` |
| 4 | CNN 基本概念 | `BV1JrG46VEgm`、`BV1o1G46zEUw` |
| 5 | LeNet-5 与经典 CNN 架构 | `BV1GSGo6JEbg`、`BV1VSGo6JEjV` |
| 6 | ResNet50、Xception 与小数据迁移学习 | `BV1pWGC6fEq7`、`BV1ypGC68EP2` |
| 7 | PyTorch 全连接、CNN 与迁移学习 | `BV1psVb6dEXE`、`BV1PsVb6dENi` |
| 8 | ResNet 从 PyTorch 到 ONNX、RKNN 和 RV1126 | `BV1JrVd6fEH5`、`BV1J6Vd68Erg` |
| 9 | Flowers5 迁移学习与 ARM 部署 | `BV1EyVd6oEHo` |
| 10 | YOLOv5 边缘部署 | `BV1gu796mETa`、`BV1ps796qECw` |
| 11 | YOLOv5 安全帽检测全流程 | `BV17UEF6LEMt`、`BV1F6EF6DEqG` |
| 12 | YOLO26 原理与边缘部署 | `BV1iR7r6tEyp`、`BV1Xp7r6JExR` |
| 13 | RNN 原理与文本分类 | `BV1G2Ej6DEL3` |
| 14 | LSTM 门控机制与长序列实验 | `BV1qqEj6oEiz` |
| 15 | Self-Attention 与 QKV 演算 | `BV1ffEQ6bEVj` |
| 16 | Transformer 原理与文本实战 | `BV18kEY6tEJs` |
| 17 | Qwen 大模型工作原理 | `BV1UJEr6LEw1` |
| 18 | BERT 原理与实战 | `BV19fJM6YEx2` |
| 19 | Whisper 架构、流程与设备部署 | `BV1qQJM6uEdh` |
| 20 | CLIP 图文匹配 | `BV18Wjg6sEjh` |
| 21 | SAM 图像分割 | `BV1DHjg6dEss` |
| 22 | GAN 与 MNIST 实战 | `BV1iDLf6TEaR`、`BV1FkLf6CE4B`、`BV1nrLf65ErC` |
| 23 | 强化学习基础与 GridWorld | `BV1F77w6HEc3` |
| 24 | Q-learning、Q 表与 epsilon-greedy | `BV1Gq7P6LE5H` |
| 25 | Gymnasium 与 FrozenLake | `BV15k7g6KEvU` |
| 26 | DQN 与 CartPole | `BV1doj26BErX` |
| 27 | DQN 与 LunarLander | `BV1mKjR6yECc` |

正式生成前，映射还要用每份 PDF 的首尾页主题和视频标题复核。若课件内容与顺序推断不一致，以课件内容和视频讲解为准并更新映射。

## 输出结构

系列放在 `docs/articles/deep-learning/`：

```text
docs/articles/deep-learning/
├── deep-learning-framework.md
├── dl-01-neural-network-tensorflow.md
├── dl-02-deep-network-training.md
├── ...
└── dl-27-dqn-lunarlander.md
```

每篇文章使用站点现有 frontmatter，`series` 固定为 `deep-learning`，`order` 与 lesson 编号一致。文件名使用 ASCII，正文使用中文。

文章不强制套用完全相同的章节标题，但必须覆盖以下信息：

- 本课解决的问题、前置知识和学习目标；
- 关键概念、公式或模型结构及其直观解释；
- 讲师在音频中补充而讲义未完整写出的推理、例子和经验；
- 理论到代码或部署流程的对应关系；
- 重要代码、参数和命令的上下文，不粘贴无法解释的大段代码；
- 常见误区、失败现象和排查思路；
- 本课小结与可用于复习的自测题；
- 对应 B 站视频链接和讲义来源说明。

总目录说明课程路线、lesson 依赖关系、理论/实操标记和每篇文章链接。

## 数据流程

1. 从 B 站公开接口保存合集标题、BV 号、CID、时长和顺序清单。
2. 为每个视频检查字幕轨道。已有字幕时直接保存带时间戳字幕；无字幕时获取 DASH 音轨并进行中文语音转写。
3. 保留原始字幕或转写稿作为中间证据，按视频和时间戳命名，不直接发布。
4. 对 PDF 逐页提取可读文本；对于整页图片型讲义，导出页面图像并进行视觉/OCR 识别。
5. 按映射将同一 lesson 的讲义、字幕和视频元数据合并为素材包。
6. 先生成 `lesson1` 样稿，复核技术准确性、信息密度、引用和发布风格。
7. 样稿通过后按顺序生成 `lesson2` 至 `lesson27`，每篇独立校验。
8. 最后生成课程总目录并运行站点构建检查。

## 失败与降级策略

- B 站接口触发风控时，优先复用用户已登录的浏览器会话；仍不可用时再请用户提供对应音频，不绕过付费或访问限制。
- 视频没有字幕时只下载音轨，不下载不必要的高清视频，以减少存储和处理时间。
- 转写低置信度的术语用讲义、代码和上下文交叉核对；无法确认的内容不猜测，在中间稿标记后人工复核。
- PDF 文字层只剩水印或乱码时，改用页面图像识别；公式和代码必须视觉核对，不能只依赖 OCR。
- 某个视频与 lesson 映射冲突时暂停该 lesson，先根据讲义首尾页和视频内容修正映射，不把错误传播到后续文章。
- 下载、转写或 OCR 失败不得阻塞其他独立 lesson，但失败项必须保留清单并在交付前关闭。

## 质量验证

每篇文章至少完成以下检查：

- 所有对应视频均已纳入，且没有跨 lesson 混入；
- 核心公式、模型名称、张量形状、命令、API 和参数与素材一致；
- 音频补充内容能够回溯到视频和时间戳；
- 代码块语法完整，命令未因转写或 OCR 引入字符错误；
- 文章不是逐字稿，理论与实操形成完整叙事；
- frontmatter、系列编号、内部链接和来源链接有效；
- 不包含未解决的 `TODO`、占位符或内部处理说明；
- 站点能够成功构建，文章在桌面与移动宽度下均可正常阅读。

## 实施顺序

1. 建立 43 个视频到 27 个 lesson 的机器可读清单。
2. 安装或准备最小必要工具：音轨下载、音频解码和中文语音转写。
3. 采集并转写 `lesson1` 的 3 个视频，解析两份 lesson1 讲义。
4. 编写并验证 `dl-01-neural-network-tensorflow.md` 样稿。
5. 复核样稿后批量采集剩余素材并逐篇生成。
6. 生成 `deep-learning-framework.md`，更新站点系列注册和导航。
7. 运行内容检查与站点构建，完成最终发布前复核。
