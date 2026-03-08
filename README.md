# Egern-Panel-Unlock-Checker

一个面向 Egern 的面板模块，用于检测当前节点对流媒体和 AI 服务的解锁状态，便于快速判断线路可用性与区域归属。

当前初始版从 `jnlaoshu/MySelf` 的面板配置中单独摘出了“流媒体&AI服务解锁检测”模块，并将脚本改为本仓库自托管，后续会在此基础上继续优化与扩展。

## 功能说明

- 检测常见流媒体与 AI 服务的解锁情况
- 显示服务可用状态、区域信息、延迟和 HTTP 状态
- 适合作为 Egern 面板中的单独检测模块使用

当前脚本内包含的检测项目以代码实现为准，初始版已覆盖：

- YouTube
- Netflix
- Disney+
- ChatGPT Web
- ChatGPT App
- Hulu(US)
- Max(HBO)

## 订阅链接

模块订阅地址：

[https://raw.githubusercontent.com/s486tt-ship-it/Egern-Panel-Unlock-Checker/main/Egern/Module/Panel.yaml](https://raw.githubusercontent.com/s486tt-ship-it/Egern-Panel-Unlock-Checker/main/Egern/Module/Panel.yaml)

脚本直链：

[https://raw.githubusercontent.com/s486tt-ship-it/Egern-Panel-Unlock-Checker/main/Script/ServiceDetection.js](https://raw.githubusercontent.com/s486tt-ship-it/Egern-Panel-Unlock-Checker/main/Script/ServiceDetection.js)

## 使用方式

将上面的模块订阅链接添加到 Egern，即可导入“流媒体&AI服务解锁检测”面板。

## 致谢

初始版本参考与摘取自以下项目：

- [jnlaoshu/MySelf](https://github.com/jnlaoshu/MySelf)
- [ByteValley/NetTool](https://github.com/ByteValley/NetTool)
