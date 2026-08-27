import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('zephyr is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,freertos,rknn,riscv,fpga,zephyr,bsp,linux-driver,usb,pcie,video-audio,deep-learning\}\/\*\*\/!\(riscv-architecture-framework\|fpga-xc7z020-framework\|freertos-kernel-framework\)\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'freertos', 'rknn', 'riscv', 'fpga', 'zephyr', 'bsp', 'linux-driver', 'usb', 'pcie', 'video-audio', 'deep-learning'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'freertos' \| 'rknn' \| 'riscv' \| 'fpga' \| 'zephyr' \| 'bsp' \| 'linux-driver' \| 'usb' \| 'pcie' \| 'video-audio' \| 'deep-learning';/);
  assert.match(seriesConfig, /zephyr:\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'freertos', 'rknn', 'riscv', 'fpga', 'zephyr', 'bsp', 'linux-driver', 'usb', 'pcie', 'video-audio', 'deep-learning'\]/);
  assert.match(articlesLib, /value === 'zephyr'/);
});

test('riscv is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,freertos,rknn,riscv,fpga,zephyr,bsp,linux-driver,usb,pcie,video-audio,deep-learning\}\/\*\*\/!\(riscv-architecture-framework\|fpga-xc7z020-framework\|freertos-kernel-framework\)\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'freertos', 'rknn', 'riscv', 'fpga', 'zephyr', 'bsp', 'linux-driver', 'usb', 'pcie', 'video-audio', 'deep-learning'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'freertos' \| 'rknn' \| 'riscv' \| 'fpga' \| 'zephyr' \| 'bsp' \| 'linux-driver' \| 'usb' \| 'pcie' \| 'video-audio' \| 'deep-learning';/);
  assert.match(seriesConfig, /riscv:\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'freertos', 'rknn', 'riscv', 'fpga', 'zephyr', 'bsp', 'linux-driver', 'usb', 'pcie', 'video-audio', 'deep-learning'\]/);
  assert.match(articlesLib, /value === 'riscv'/);
});

test('the first RISC-V article includes required published frontmatter', () => {
  const articlePath = 'docs/articles/riscv/qemu-riscv-01-env-setup-hello-world.md';
  const markdown = readFileSync(articlePath, 'utf8');

  assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
  assert.match(markdown, /^series: riscv$/m);
  assert.match(markdown, /^order: 1$/m);
  assert.match(markdown, /^draft: false$/m);
  assert.ok(markdown.split(/\r?\n/).length >= 300);
  assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5);
});

test('the second RISC-V article covers an engineering CMake build workflow', () => {
  const articlePath = 'docs/articles/riscv/qemu-riscv-02-cmake-build-system.md';
  const markdown = readFileSync(articlePath, 'utf8');

  assert.match(markdown, /^title: "嵌入式知识体系 · RISC-V 架构精讲 #02 · CMake 构建系统：工程化构建管理"$/m);
  assert.match(markdown, /^series: riscv$/m);
  assert.match(markdown, /^order: 2$/m);
  assert.match(markdown, /^draft: false$/m);
  assert.ok(markdown.split(/\r?\n/).length >= 300, 'article should be long-form');
  assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, 'article should include explanatory diagrams');
});

test('the third RISC-V article explains registers and assembly at the ABI boundary', () => {
  const articlePath = 'docs/articles/riscv/qemu-riscv-03-register-assembly.md';
  const markdown = readFileSync(articlePath, 'utf8');

  assert.match(markdown, /^title: "嵌入式知识体系 · RISC-V 架构精讲 #03 · RISC-V 寄存器架构与汇编语法"$/m);
  assert.match(markdown, /^series: riscv$/m);
  assert.match(markdown, /^order: 3$/m);
  assert.match(markdown, /^draft: false$/m);
  assert.ok(markdown.split(/\r?\n/).length >= 300, 'article should be long-form');
  assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, 'article should include explanatory diagrams');
});

test('remaining RISC-V articles meet the long-form publication contract', () => {
  const articles = [
    ['qemu-riscv-04-linker-startup.md', 4],
    ['qemu-riscv-05-interrupt-clint-plic.md', 5],
    ['qemu-riscv-06-timer-tick.md', 6],
    ['qemu-riscv-07-freertos-port-p1.md', 7],
    ['qemu-riscv-08-freertos-port-p2.md', 8],
    ['qemu-riscv-09-debug-gdb-test.md', 9],
    ['qemu-riscv-10-customize-virt-machine.md', 10],
    ['riscv-11-instruction-encoding-qemu-internals.md', 11],
    ['riscv-12-privilege-csr-trap.md', 12],
    ['riscv-13-atomic-lrsc-amo-fence.md', 13],
    ['riscv-14-datapath-pipeline.md', 14],
    ['riscv-15-hazard-branch-prediction.md', 15],
    ['riscv-16-cache-memory-hierarchy.md', 16],
    ['riscv-17-picorv32-vexriscv-analysis.md', 17],
    ['riscv-18-softcore-rv32-vs-rv64.md', 18],
    ['riscv-19-sv39-mmu-page-table.md', 19],
    ['riscv-20-opensbi-linux-boot-chain.md', 20],
    ['riscv-21-zynq-xc7z020-vivado.md', 21],
    ['riscv-22-microblaze-v-minimal-system.md', 22],
    ['riscv-23-microblaze-v-baremetal-gpio-uart.md', 23],
    ['riscv-24-microblaze-v-freertos.md', 24],
    ['riscv-25-final-project-riscv-softcore-soc.md', 25],
    ['riscv-26-sg2002-milkv-duo-npu-soc.md', 26],
    ['riscv-27-rvv-vector-extension.md', 27],
    ['riscv-28-rvv-matrix-mul-conv.md', 28],
    ['riscv-29-edge-ai-deploy-riscv.md', 29],
    ['riscv-30-final-project-riscv-edge-ai.md', 30],
  ];

  for (const [file, order] of articles) {
    const markdown = readFileSync(join('docs/articles/riscv', file), 'utf8');

    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: riscv$/m);
    assert.match(markdown, new RegExp(`^order: ${order}$`, 'm'));
    assert.match(markdown, /^draft: false$/m);
    assert.ok(markdown.split(/\r?\n/).length >= 300, `${file} should be long-form`);
    assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, `${file} should include explanatory diagrams`);
  }
});

test('the RISC-V series framework is excluded from article collection loading', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');

  assert.match(contentConfig, /\*\*\/!\(riscv-architecture-framework\|fpga-xc7z020-framework\|freertos-kernel-framework\)\.md/);
});

test('zephyr articles include required frontmatter', () => {
  const zephyrDir = 'docs/articles/zephyr';
  const files = readdirSync(zephyrDir).filter((file) => file.endsWith('.md'));

  assert.ok(files.length >= 3);

  for (const file of files) {
    const markdown = readFileSync(join(zephyrDir, file), 'utf8');
    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: zephyr$/m);
    assert.match(markdown, /^order: \d+$/m);
    const isDraft = file === 'zephyr-framework.md';
    assert.match(markdown, isDraft ? /^draft: true$/m : /^draft: false$/m);
  }
});

test('bsp is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,freertos,rknn,riscv,fpga,zephyr,bsp,linux-driver,usb,pcie,video-audio,deep-learning\}\/\*\*\/!\(riscv-architecture-framework\|fpga-xc7z020-framework\|freertos-kernel-framework\)\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'freertos', 'rknn', 'riscv', 'fpga', 'zephyr', 'bsp', 'linux-driver', 'usb', 'pcie', 'video-audio', 'deep-learning'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'freertos' \| 'rknn' \| 'riscv' \| 'fpga' \| 'zephyr' \| 'bsp' \| 'linux-driver' \| 'usb' \| 'pcie' \| 'video-audio' \| 'deep-learning';/);
  assert.match(seriesConfig, /bsp:\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'freertos', 'rknn', 'riscv', 'fpga', 'zephyr', 'bsp', 'linux-driver', 'usb', 'pcie', 'video-audio', 'deep-learning'\]/);
  assert.match(articlesLib, /value === 'bsp'/);
});

test('bsp articles include required frontmatter', () => {
  const bspDir = 'docs/articles/bsp';
  const files = readdirSync(bspDir).filter((file) => file.endsWith('.md'));

  assert.equal(files.length, 21);

  for (const file of files) {
    const markdown = readFileSync(join(bspDir, file), 'utf8');
    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: bsp$/m);
    assert.match(markdown, /^order: \d+$/m);
    const isDraft = file === 'linux-bsp-framework.md';
    assert.match(markdown, isDraft ? /^draft: true$/m : /^draft: false$/m);
  }
});

test('published BSP articles 10 through 20 meet the long-form publication standard', () => {
  const bspDir = 'docs/articles/bsp';

  for (let order = 10; order <= 20; order += 1) {
    const prefix = `bsp-${String(order).padStart(2, '0')}-`;
    const file = readdirSync(bspDir).find((candidate) => candidate.startsWith(prefix));
    assert.ok(file, `missing article for BSP-${String(order).padStart(2, '0')}`);

    const markdown = readFileSync(join(bspDir, file), 'utf8');
    assert.ok(markdown.split(/\r?\n/).length >= 300, `${file} must be a long-form article`);
    assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, `${file} must include at least five Mermaid diagrams`);
  }
});

test('video-audio is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,freertos,rknn,riscv,fpga,zephyr,bsp,linux-driver,usb,pcie,video-audio,deep-learning\}\/\*\*\/!\(riscv-architecture-framework\|fpga-xc7z020-framework\|freertos-kernel-framework\)\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'freertos', 'rknn', 'riscv', 'fpga', 'zephyr', 'bsp', 'linux-driver', 'usb', 'pcie', 'video-audio', 'deep-learning'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'freertos' \| 'rknn' \| 'riscv' \| 'fpga' \| 'zephyr' \| 'bsp' \| 'linux-driver' \| 'usb' \| 'pcie' \| 'video-audio' \| 'deep-learning';/);
  assert.match(seriesConfig, /'video-audio':\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'freertos', 'rknn', 'riscv', 'fpga', 'zephyr', 'bsp', 'linux-driver', 'usb', 'pcie', 'video-audio', 'deep-learning'\]/);
  assert.match(articlesLib, /value === 'video-audio'/);
});

test('video-audio articles include required frontmatter', () => {
  const videoAudioDir = 'docs/articles/video-audio';
  const files = readdirSync(videoAudioDir).filter((file) => file.endsWith('.md'));

  assert.equal(files.length, 26);

  for (const file of files) {
    const markdown = readFileSync(join(videoAudioDir, file), 'utf8');
    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: video-audio$/m);
    assert.match(markdown, /^order: \d+$/m);
    assert.match(markdown, /^draft: false$/m);
  }
});

test('usb and pcie are registered as independent first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /usb/);
  assert.match(contentConfig, /pcie/);
  assert.doesNotMatch(contentConfig, /usb-pcie/);
  assert.match(seriesConfig, /usb:\s*\{/);
  assert.match(seriesConfig, /pcie:\s*\{/);
  assert.doesNotMatch(seriesConfig, /'usb-pcie':\s*\{/);
  assert.match(articlesLib, /value === 'usb'/);
  assert.match(articlesLib, /value === 'pcie'/);
});

test('usb articles include contiguous published frontmatter', () => {
  const usbDir = 'docs/articles/usb';
  assert.ok(existsSync(usbDir), 'USB article directory must exist');
  const files = readdirSync(usbDir).filter((file) => file.endsWith('.md'));

  assert.equal(files.length, 10);

  for (const [index, file] of files.sort().entries()) {
    const markdown = readFileSync(join(usbDir, file), 'utf8');
    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: usb$/m);
    assert.match(markdown, new RegExp(`^order: ${index + 1}$`, 'm'));
    assert.match(markdown, /^draft: false$/m);
  }
});

test('pcie articles include contiguous published frontmatter', () => {
  const pcieDir = 'docs/articles/pcie';
  assert.ok(existsSync(pcieDir), 'PCIe article directory must exist');
  const files = readdirSync(pcieDir).filter((file) => file.endsWith('.md'));

  assert.equal(files.length, 16);

  const orders = files.map((file) => {
    const markdown = readFileSync(join(pcieDir, file), 'utf8');
    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: pcie$/m);
    assert.match(markdown, /^draft: false$/m);
    return Number(markdown.match(/^order: (\d+)$/m)?.[1]);
  });

  assert.deepEqual(orders.sort((a, b) => a - b), Array.from({ length: 16 }, (_, index) => index + 1));
});

test('fpga is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /fpga/);
  assert.match(contentConfig, /fpga-xc7z020-framework/);
  assert.match(seriesConfig, /fpga:\s*\{/);
  assert.match(articlesLib, /value === 'fpga'/);
});

test('fpga framework is a draft planning artifact', () => {
  const frameworkPath = 'docs/articles/fpga/fpga-xc7z020-framework.md';
  assert.ok(existsSync(frameworkPath));
  const markdown = readFileSync(frameworkPath, 'utf8');

  assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
  assert.match(markdown, /^series: fpga$/m);
  assert.match(markdown, /^draft: true$/m);
});

test('RKNN C++ extension provides the approved six-article sequence', () => {
  const rknnDir = 'docs/articles/rknn';
  const frameworkPath = join(rknnDir, 'rknn-cpp-engineering-framework.md');

  assert.ok(existsSync(frameworkPath), 'RKNN C++ framework must exist');
  const framework = readFileSync(frameworkPath, 'utf8');
  assert.match(framework, /^series: rknn$/m);
  assert.match(framework, /^draft: true$/m);

  const articles = [
    ['rknn-11-cpp-inference-service-skeleton.md', 11],
    ['rknn-12-cpp-raii-smart-pointer-ownership.md', 12],
    ['rknn-13-cpp-image-tensor-memory-data-path.md', 13],
    ['rknn-14-cpp-deployment-api-design.md', 14],
    ['rknn-15-cpp-concurrent-inference-pipeline.md', 15],
    ['rknn-16-cpp-profiling-testing-production-skeleton.md', 16],
  ];

  for (const [file, order] of articles) {
    const articlePath = join(rknnDir, file);
    assert.ok(existsSync(articlePath), `missing RKNN C++ article: ${file}`);
    const markdown = readFileSync(articlePath, 'utf8');

    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: rknn$/m);
    assert.match(markdown, new RegExp(`^order: ${order}$`, 'm'));
    assert.match(markdown, /^draft: false$/m);
    assert.ok(markdown.split(/\r?\n/).length >= 120, `${file} must be a substantive article`);
    assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 2, `${file} must include at least two Mermaid diagrams`);
  }
});

test('RKNN C++ extension teaches C++ language mechanisms instead of deployment workflow', () => {
  const rknnDir = 'docs/articles/rknn';
  const expectations = [
    ['rknn-11-cpp-inference-service-skeleton.md', 'C++ 对象模型：构造、析构、RAII 与生命周期', /构造函数|析构函数/, /RAII/],
    ['rknn-12-cpp-raii-smart-pointer-ownership.md', 'C++ 内存管理：new/delete、智能指针与所有权', /std::unique_ptr/, /std::shared_ptr/],
    ['rknn-13-cpp-image-tensor-memory-data-path.md', 'C++ 值类别与移动语义：拷贝控制、右值与完美转发', /右值/, /std::move/],
    ['rknn-14-cpp-deployment-api-design.md', 'C++ 泛型编程：模板、类型推导、Lambda 与回调', /模板/, /Lambda/],
    ['rknn-15-cpp-concurrent-inference-pipeline.md', 'C++ 多线程基础：std::thread、互斥、条件变量与锁', /std::thread/, /条件变量/],
    ['rknn-16-cpp-profiling-testing-production-skeleton.md', 'C++ 并发进阶：atomic、内存序、生产者消费者与线程池', /std::atomic/, /内存序/],
  ];

  for (const [file, title, firstConcept, secondConcept] of expectations) {
    const markdown = readFileSync(join(rknnDir, file), 'utf8');
    const order = Number(file.match(/^rknn-(\d+)/)?.[1]);
    assert.ok(markdown.includes(`title: "RKNN 端侧部署实战 · 第${order}期：${title}"`));
    assert.match(markdown, firstConcept);
    assert.match(markdown, secondConcept);
  }
});

test('RKNN C++ object-model article covers the full lifetime knowledge map', () => {
  const markdown = readFileSync('docs/articles/rknn/rknn-11-cpp-inference-service-skeleton.md', 'utf8');
  const concepts = [
    '对象与存储', '静态存储期', '线程存储期', '自动存储期', '动态存储期',
    '零初始化', '默认初始化', '值初始化', '直接初始化', '列表初始化', '聚合初始化',
    '成员初始化列表', '委托构造', '部分构造', '构造函数异常',
    '虚析构函数', '纯虚析构函数', '对象切片', 'RAII', 'placement new',
    'std::launder', '三法则', '五法则', '零法则',
  ];

  for (const concept of concepts) {
    assert.ok(markdown.includes(concept), `object-model article must explain: ${concept}`);
  }
});

test('RKNN C++ memory article covers allocation, ownership, and allocator knowledge map', () => {
  const markdown = readFileSync('docs/articles/rknn/rknn-12-cpp-raii-smart-pointer-ownership.md', 'utf8');
  const concepts = [
    'new 表达式', 'operator new', 'placement new', '对齐', 'std::align',
    'std::allocator', 'std::pmr', 'monotonic_buffer_resource', 'polymorphic_allocator',
    '裸指针', 'std::unique_ptr', 'std::shared_ptr', 'std::weak_ptr', '自定义 deleter',
    'make_unique', 'make_shared', 'aliasing constructor', '所有权环', 'enable_shared_from_this',
    '悬空指针', 'double free', '内存泄漏', '三法则', '五法则', '零法则',
  ];
  for (const concept of concepts) {
    assert.ok(markdown.includes(concept), `memory article must explain: ${concept}`);
  }
});

test('RKNN C++ value-category article covers value, reference, and move knowledge map', () => {
  const markdown = readFileSync('docs/articles/rknn/rknn-13-cpp-image-tensor-memory-data-path.md', 'utf8');
  const concepts = [
    'glvalue', 'lvalue', 'xvalue', 'prvalue', 'rvalue', 'materialization',
    '左值引用', '右值引用', 'const 左值引用', '引用折叠', '转发引用',
    '重载决议', 'std::move', 'std::forward', '移动构造函数', '移动赋值运算符',
    '复制省略', 'guaranteed copy elision', '命名返回值优化', 'noexcept',
    '完美转发', '悬空引用', 'move_if_noexcept',
  ];
  for (const concept of concepts) {
    assert.ok(markdown.includes(concept), `value-category article must explain: ${concept}`);
  }
});

test('RKNN C++ template, threading, and atomic articles cover their full knowledge maps', () => {
  const expectations = [
    ['rknn-14-cpp-deployment-api-design.md', ['模板实例化', '两阶段查找', '依赖名', 'typename', 'template 关键字', '显式特化', '偏特化', 'SFINAE', 'std::enable_if', 'std::void_t', 'type traits', 'std::decay', 'Lambda', '泛型 Lambda', 'std::function', '类型擦除']],
    ['rknn-15-cpp-concurrent-inference-pipeline.md', ['数据竞争', 'happens-before', 'joinable', 'detach', 'recursive_mutex', 'timed_mutex', 'shared_mutex', 'lock_guard', 'unique_lock', 'scoped_lock', 'adopt_lock', 'defer_lock', '条件变量', '虚假唤醒', 'notify_one', 'notify_all', 'std::once_flag', 'std::call_once', 'promise', 'future', 'packaged_task', 'async', '死锁', 'livelock']],
    ['rknn-16-cpp-profiling-testing-production-skeleton.md', ['std::atomic', 'is_lock_free', 'compare_exchange_weak', 'compare_exchange_strong', '内存序', 'memory_order_relaxed', 'memory_order_consume', 'memory_order_acquire', 'memory_order_release', 'memory_order_acq_rel', 'memory_order_seq_cst', 'synchronizes-with', 'fence', 'false sharing', 'hardware_destructive_interference_size', '生产者消费者', '线程池']],
  ];
  for (const [file, concepts] of expectations) {
    const markdown = readFileSync(join('docs/articles/rknn', file), 'utf8');
    for (const concept of concepts) assert.ok(markdown.includes(concept), `${file} must explain: ${concept}`);
  }
});

test('video-audio orders driver frameworks before application APIs', () => {
  const dir = 'docs/articles/video-audio';
  const expected = [
    ['av-01-av-overview-sampling-to-streaming.md', 1], ['av-02-rv1126-imx415-platform-overview.md', 2], ['av-03-image-basics-yuv-raw-bandwidth.md', 3], ['av-04-v4l2-media-controller-driver-framework.md', 4],
    ['av-05-sensor-driver-dts-lighting-up-camera.md', 5], ['av-06-rkmedia-vi-mipi-csi-capture.md', 6], ['av-07-isp-pipeline-video-3a-ae-awb-af.md', 7], ['av-08-3a-tuning-practice-scenarios-iq.md', 8], ['av-09-vpss-scaler-crop-multichannel.md', 9], ['av-10-pixel-processing-rgb-yuv-scaler.md', 10],
    ['av-04-audio-basics-toolchain-first-command.md', 11], ['av-12-alsa-asoc-driver-framework.md', 12], ['av-11-audio-capture-ringbuffer-level-wav.md', 13], ['av-12-audio-3a-aec-ans-agc.md', 14], ['av-13-video-encoding-h264-h265-principles.md', 15], ['av-14-venc-hardware-encoder-rkmedia.md', 16], ['av-15-ffmpeg-cli-deep-dive-filters-transcode.md', 17], ['av-16-ffmpeg-libav-c-api-pipeline.md', 18], ['av-17-audio-encoding-mux-avsync.md', 19], ['av-18-rtp-rtcp-basics-jitter-buffer.md', 20], ['av-19-rtsp-streaming-practice.md', 21], ['av-20-gstreamer-core-pipeline-basics.md', 22], ['av-21-gstreamer-advanced-appsrc-mpp-lowlatency.md', 23], ['av-22-avsync-minimal-player.md', 24], ['av-23-pipeline-engineering-threads-zerocopy.md', 25], ['av-24-final-project-smart-camera.md', 26],
  ];
  assert.equal(readdirSync(dir).filter((file) => file.endsWith('.md')).length, 26);
  for (const [file, order] of expected) {
    const markdown = readFileSync(join(dir, file), 'utf8');
    assert.match(markdown, new RegExp(`^order: ${order}$`, 'm'));
    assert.match(markdown, /^series: video-audio$/m);
  }
});

test('V4L2 framework article covers the kernel driver model in depth', () => {
  const markdown = readFileSync('docs/articles/video-audio/av-04-v4l2-media-controller-driver-framework.md', 'utf8');
  const concepts = ['v4l2_device_register', 'video_register_device', 'v4l2_fh', 'v4l2_file_operations', 'v4l2_ioctl_ops', 'v4l2_subdev', 'media_entity_pads_init', 'media_create_pad_link', 'async notifier', 'V4L2_SUBDEV_FORMAT_TRY', 'V4L2_SUBDEV_FORMAT_ACTIVE', 'V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE', 'vb2_queue', 'queue_setup', 'buf_prepare', 'buf_queue', 'start_streaming', 'stop_streaming', 'vb2_buffer_done', 'vb2_dma_contig_memops', 'v4l2_ctrl_handler', 'VIDIOC_QUERYCAP', 'VIDIOC_ENUM_FMT', 'VIDIOC_S_FMT', 'VIDIOC_REQBUFS', 'VIDIOC_QBUF', 'VIDIOC_STREAMON', 'VIDIOC_DQBUF', 'runtime PM'];
  assert.ok(markdown.split(/\r?\n/).length >= 350, 'V4L2 article must be long-form');
  assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, 'V4L2 article must include at least five diagrams');
  for (const concept of concepts) assert.ok(markdown.includes(concept), `V4L2 article must explain: ${concept}`);
});

test('ALSA and ASoC framework article covers the kernel driver model in depth', () => {
  const markdown = readFileSync('docs/articles/video-audio/av-12-alsa-asoc-driver-framework.md', 'utf8');
  const concepts = ['snd_card_new', 'snd_pcm_new', 'snd_pcm_substream', 'snd_pcm_runtime', 'snd_pcm_hardware', 'snd_pcm_ops', 'snd_pcm_period_elapsed', 'snd_soc_component_driver', 'snd_soc_dai_driver', 'snd_soc_card', 'snd_soc_dai_link', 'snd_soc_register_component', 'devm_snd_soc_register_card', 'snd_dmaengine_pcm_register', 'hw_params', 'set_fmt', 'set_sysclk', 'SND_SOC_DAIFMT_I2S', 'SND_SOC_DAIFMT_CBS_CFS', 'TDM slot', 'DAPM widget', 'DAPM route', 'SOC_SINGLE_TLV', 'regmap', 'runtime PM', 'DPCM', 'underrun', 'overrun', 'xrun'];
  assert.ok(markdown.split(/\r?\n/).length >= 350, 'ALSA/ASoC article must be long-form');
  assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, 'ALSA/ASoC article must include at least five diagrams');
  for (const concept of concepts) assert.ok(markdown.includes(concept), `ALSA/ASoC article must explain: ${concept}`);
});
