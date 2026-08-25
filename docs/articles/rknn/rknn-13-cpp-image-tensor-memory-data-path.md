---
title: "RKNN 端侧部署实战 · 第13期：C++ 值类别与移动语义：拷贝控制、右值与完美转发"
description: "系统解释 C++17 的 glvalue、prvalue、引用折叠、重载决议、复制省略与完美转发，建立准确的移动语义模型。"
pubDate: 2026-08-27
series: rknn
order: 13
tags: ["C++17", "值类别", "移动语义", "完美转发", "复制省略"]
draft: false
---

> 系列：RKNN 端侧部署实战
> 本篇讨论表达式值类别、引用和对象资源转交。它解释语言规则，不把 `std::move` 简化成“性能开关”。

# C++ 值类别与移动语义：拷贝控制、右值与完美转发

移动语义容易被误记成“右值不复制”。更准确的说法是：表达式的值类别参与重载决议；某些重载把对象资源转交给目标；转交之后源对象仍需满足析构和赋值要求。理解 glvalue、prvalue 和引用折叠，才能知道 `std::move` 与 `std::forward` 在什么时候正确。

## 值类别的完整关系

C++17 用两条轴描述表达式：是否有可识别身份、是否可被移动。常见术语如下：

| 类别 | 含义 | 例子 |
| --- | --- | --- |
| lvalue | 有身份、可定位的表达式 | 有名字的变量、解引用结果 |
| xvalue | 有身份、资源可被转交的表达式 | `std::move(x)`、某些成员访问 |
| glvalue | lvalue 与 xvalue 的并集 | 有身份的表达式 |
| prvalue | 纯计算结果，不直接表示已有对象身份 | `42`、`T{}`、函数返回临时值 |
| rvalue | prvalue 与 xvalue 的并集 | 可匹配右值引用的表达式 |

```mermaid
flowchart TD
    G[glvalue：有身份] --> L[lvalue]
    G --> X[xvalue]
    R[rvalue：可转交] --> X
    R --> P[prvalue]
    L --> E[具名对象、解引用]
    X --> M[std::move(x)]
    P --> T[T{} 或计算临时值]
```

有名字的变量永远是 lvalue，即使它的类型是 `T&&`：

```cpp
void Consume(Buffer&& buffer) {
  // buffer 的声明类型是 Buffer&&，但表达式 buffer 是 lvalue。
  Use(buffer);            // 匹配 lvalue 路径
  Use(std::move(buffer)); // 转为 xvalue，允许匹配右值路径
}
```

## materialization：prvalue 如何变成可用对象

C++17 强化了 prvalue 的模型。prvalue 不总是先生成一个可观察的临时对象再复制；当程序需要一个有存储身份的对象时才发生 **materialization**。这也是 C++17 能保证某些复制省略的基础。

```cpp
struct Token { Token(); Token(const Token&); Token(Token&&); };
Token Make() { return Token{}; }
Token token = Make();
```

在 C++17 的某些场景中，`Token{}` 直接构造最终的 `token`；它不是“优化器碰巧省掉拷贝”，而是语言语义允许的 **guaranteed copy elision**。不要依赖拷贝/移动构造函数的日志来观察这类临时对象数量。

## 左值引用、右值引用与 const 左值引用

`T&` 是**左值引用**，绑定到有身份对象；`T&&` 是**右值引用**，通常绑定 rvalue；`const T&` 则能延长临时对象寿命并同时绑定左值或右值。

```cpp
std::string name = "edge";
std::string& left = name;
const std::string& read_only = std::string("temporary");
std::string&& right = std::string("temporary");
```

`const 左值引用` 很适合只读参数：既避免复制，又接受临时值。它不意味着“对象永远不变”，只意味着不能经由这个引用修改对象。

临时对象的生命周期只会因为直接绑定的引用延长到该引用的作用域；不要把它返回、存入成员或跨异步边界：

```cpp
const std::string& Bad() {
  return std::string("temporary"); // 悬空引用
}
```

**悬空引用** 与移动无关，它是生命周期已经结束却继续借用的问题。

## 引用折叠与转发引用

模板类型推导中，`T&&` 可能是**转发引用**，不是固定的右值引用。规则由引用折叠给出：

| 组合 | 折叠结果 |
| --- | --- |
| `T& &` | `T&` |
| `T& &&` | `T&` |
| `T&& &` | `T&` |
| `T&& &&` | `T&&` |

```cpp
template <typename T>
void Forward(T&& value) {  // T 推导时，T&& 是转发引用
  Target(std::forward<T>(value));
}

Widget widget;
Forward(widget);          // T = Widget&，参数为 Widget&
Forward(Widget{});        // T = Widget，参数为 Widget&&
```

只有在“模板参数推导 + `T&&` 形式”下才称转发引用。类模板已确定的 `T&&` 成员函数、或 `const T&&`，都不是转发引用。

## std::move 与 std::forward 的真实职责

`std::move(x)` 本质是 `static_cast<T&&>(x)`：把表达式转换为 xvalue。它不移动内存、不清空对象，也不保证后续调用一定选择移动构造函数。

```cpp
std::vector<int> values{1, 2, 3};
auto next = std::move(values); // 若选择 vector 的移动构造，next 接管内部存储
// values 有效但处于未指定状态；可赋值、clear、析构，不能假定仍有三个元素。
```

`std::forward<T>(x)` 用于保留转发引用参数在调用点的原始值类别。普通局部变量要交出资源时用 `std::move`；在模板包装器里把参数原样继续传递时用 `std::forward`。两者不能互换。

## 重载决议如何选择复制或移动

```cpp
void Process(const Buffer& value); // 读取或复制来源
void Process(Buffer&& value);      // 接管资源路径

Buffer buffer;
Process(buffer);            // 选 const Buffer&
Process(std::move(buffer)); // 选 Buffer&&
Process(Buffer{});          // 选 Buffer&&
```

重载决议先看表达式类别，再看 cv 限定、继承转换、模板推导等规则。`const Buffer` 即使 `std::move` 后通常也无法匹配可修改的 `Buffer&&`，会退回复制路径：移动要求可以改变源对象。

## 移动构造函数、移动赋值运算符与不变量

**移动构造函数**从一个将亡对象构造新对象；**移动赋值运算符**先处理目标已有资源，再接管源资源。两者都必须让源对象保持“有效但未指定”的可析构状态。

```cpp
class Handle {
 public:
  Handle(Handle&& other) noexcept : fd_(other.fd_) { other.fd_ = -1; }
  Handle& operator=(Handle&& other) noexcept {
    if (this != &other) {
      CloseIfNeeded(fd_);
      fd_ = other.fd_;
      other.fd_ = -1;
    }
    return *this;
  }
 private:
  int fd_ = -1;
};
```

自移动赋值虽罕见，但通用实现仍应保守处理。实际设计优先把资源交给 `unique_ptr` 等 RAII 成员，遵循零法则，而非手写所有特殊成员函数。

## noexcept 影响容器策略

容器扩容时需要保留异常安全。若元素的移动构造不标为 `noexcept`，而复制构造可用，`std::vector` 可能选择复制旧元素，避免移动到一半抛异常后无法恢复。

```cpp
class Task {
 public:
  Task(Task&&) noexcept = default;
  Task(const Task&) = delete;
};
```

`noexcept` 不是性能提示，而是承诺。错误地承诺后若移动抛异常，程序会 terminate。

`std::move_if_noexcept(x)` 在泛型代码里表达保守策略：若移动不会抛异常或对象不可复制则移动，否则选择复制。

## 复制省略、命名返回值优化与 return

**复制省略** 包括直接构造最终对象与**命名返回值优化**（NRVO）。NRVO 对具名局部变量通常可做但不总是强制；C++17 对某些 prvalue 返回提供 guaranteed copy elision。

```cpp
Buffer MakeBuffer() {
  Buffer result(1024);
  Fill(result);
  return result; // 允许 NRVO；未发生时也可移动
}
```

不要写 `return std::move(result);`。它可能抑制命名返回值优化，并且让代码暗示调用者必须依赖移动。直接返回局部对象是正确默认。

## 完美转发与它的边界

**完美转发** 指模板包装器把参数的类型、const 和值类别尽可能保留给下游：

```cpp
template <typename T, typename... Args>
std::unique_ptr<T> Make(Args&&... args) {
  return std::make_unique<T>(std::forward<Args>(args)...);
}
```

它不等于“所有参数都高效”。initializer_list、重载函数名、bit-field、代理引用和多次转发都会引入边界。一个转发引用参数通常只能被完美转发一次；第一次下游调用若移动它，第二次调用再转发就是使用 moved-from 对象。

## 快速判断表

| 需求 | 参数形式/工具 |
| --- | --- |
| 仅读取、不保存 | `const T&` |
| 修改调用者对象 | `T&` |
| 函数一定要拥有副本 | `T`，内部 `std::move` 到成员 |
| 明确接管临时资源 | `T&&` 或按值 + move |
| 模板透传参数 | `T&&` + `std::forward<T>` |
| 需要长期保存 | 值对象或 owner，不能保存借用引用 |

> 🏷️ 标签：#C++17 #glvalue #右值 #std::move #std::forward #复制省略

## 值类别与重载匹配图

```mermaid
flowchart TD
    A[具名对象 buffer] --> B[lvalue]
    C[std::move(buffer)] --> D[xvalue]
    E[Buffer{}] --> F[prvalue]
    B --> G[Process(const Buffer&)]
    D --> H[Process(Buffer&&)]
    F --> H
```
