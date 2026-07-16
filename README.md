<p align="center">
  <img src="https://img.shields.io/badge/status-completed-success" alt="Status">
  <img src="https://img.shields.io/badge/security-audit-blue" alt="Security Audit">
  <img src="https://img.shields.io/badge/student-Zhaoyang--haha-orange" alt="Student">
  <img src="https://img.shields.io/badge/vulnerabilities-49-red" alt="49 Vulnerabilities">
  <img src="https://img.shields.io/badge/flask-3.0+-blue?logo=flask" alt="Flask">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

<div align="center">

# 🔒 Flask Web 应用安全审计与加固

### 学生：郭昭阳（Zhaoyang-haha）

📆 2026-07-16 &nbsp;|&nbsp; 🐧 Kali Linux + 🐍 Flask 3.1 + 🕵️ Burp Suite CE

[🌐 在线演示](https://zhaoyang-haha.github.io/flask-password-security-audit) &nbsp;|&nbsp; [📦 GitHub](https://github.com/Zhaoyang-haha/flask-password-security-audit)

**8 轮迭代 · 8 个功能模块 · 49 个安全漏洞（全部修复）**

</div>

---

## 📋 项目概述

从零开始构建一个 Flask 用户管理系统，每轮新增功能后进行**完整的安全审计与加固**。涵盖密码安全、SQL注入、文件上传、业务逻辑、文件包含、CSRF、SSRF、命令注入八大安全类别。

| 轮次 | 新增功能 | 漏洞数 | 主要漏洞类型 |
|:----:|---------|:------:|-------------|
| 第1轮 | 基础登录功能 | 7 | 密码明文、弱密钥、爆破防护 |
| 第2轮 | 注册 + 搜索功能 | 8 | SQL注入、CSRF、Cookie安全 |
| 第3轮 | 头像上传功能 | 7 | 任意文件上传、路径穿越、XSS |
| 第4轮 | 个人中心 + 充值功能 | 8 | IDOR越权、负值充值、业务逻辑 |
| 第5轮 | 动态页面加载功能 | 5 | 文件包含、LFI、信息泄露 |
| 第6轮 | 修改密码功能 | 5 | CSRF跨站请求伪造 |
| 第7轮 | URL 抓取功能 | 7 | SSRF 服务端请求伪造 |
| 第8轮 | Ping 网络诊断功能 | 8 | **命令注入（Command Injection）** |
| **总计** | **8个功能模块** | **49** | **全部修复 ✅** |

---

## 🗂️ 报告列表

| 报告 | 直达链接 |
|------|---------|
| 🛡️ Web 应用安全审计与加固 | [`web-security-audit/`](./web-security-audit/) |
| 🔒 密码安全修复报告 | [`password-security-audit/`](./password-security-audit/) |
| 📁 文件上传漏洞分析与防护 | [`file-upload-audit/`](./file-upload-audit/) |
| 🏦 业务逻辑漏洞与越权分析 | [`business-logic-audit/`](./business-logic-audit/) |
| 📄 文件包含漏洞分析与防护 | [`file-inclusion-audit/`](./file-inclusion-audit/) |
| 🔒 CSRF 跨站请求伪造分析 | [`csrf-audit/`](./csrf-audit/) |
| 📡 SSRF 服务端请求伪造分析 | [`ssrf-audit/`](./ssrf-audit/) |
| 💀 命令注入漏洞分析与防护 | [`cmd-audit/`](./cmd-audit/) |

---

## 🛠 技术栈

| 工具 | 用途 |
|------|------|
| Python Flask 3.1 | Web 框架 |
| Werkzeug | 密码哈希（scrypt） |
| SQLite 3 | 数据库 |
| Burp Suite CE | 安全测试（代理抓包/Repeater/Intruder） |
| Kali Linux 2026.1 | 测试环境 |
| Python subprocess | Ping 命令执行（命令注入功能） |

---

## 📊 漏洞类型分布

```
命令注入            6  ███████████████▏    12%
CSRF 漏洞           5  █████████████▏      10%
SQL 注入            4  ██████████▏          8%
SSRF 漏洞           4  ██████████▏          8%
文件包含/路径遍历    3  ████████▏           6%
文件上传类型缺失     3  ████████▏           6%
IDOR 越权访问       2  █████▏              4%
业务逻辑缺陷        2  █████▏              4%
密码/信息泄露        2  █████▏              4%
XSS 跨站脚本        2  █████▏              4%
安全配置错误        3  ████████▏           6%
其他               10  ████████████████████▏ 20%
───────────────────────────────────────────────
总计               49  100%
```

---

## 📄 许可

MIT License — &copy; 2026 郭昭阳 (Zhaoyang-haha)
