<p align="center">
  <img src="https://img.shields.io/badge/status-completed-success" alt="Status">
  <img src="https://img.shields.io/badge/security-audit-blue" alt="Security Audit">
  <img src="https://img.shields.io/badge/flask-3.0+-blue?logo=flask" alt="Flask">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/vulnerabilities-34-red" alt="34 Vulnerabilities">
</p>

<div align="center">
  <h1>🔒 Flask 安全审计项目合集</h1>
  <h3>Flask Security Audit Projects Portfolio</h3>
  <br>
  <p><strong>🌐 在线演示：</strong> <a href="https://zhaoyang-haha.github.io/flask-password-security-audit">zhaoyang-haha.github.io/flask-password-security-audit</a></p>
  <p><strong>累计修复：</strong>6 轮迭代 · 6 个功能模块 · <strong>34 个安全漏洞</strong> · 覆盖 OWASP Top 10 六大类别</p>
</div>

---

## 📋 项目简介 | Introduction

本仓库汇集了**六个** Flask Web 应用安全审计项目，从基础密码安全到 CSRF 防护，累计发现并修复了 **34 个安全漏洞**。

This repository contains **six** Flask web application security audit projects. A total of **34 security vulnerabilities** were discovered and fixed across 6 iterative rounds.

| 项目 | 漏洞数 | 严重程度 |
|------|--------|---------|
| 🛡️ [Web 安全审计与加固](#web-安全审计与加固) | 8 个 | 2 严重 + 1 高危 + 5 中危 |
| 🔒 [密码安全修复](#密码安全修复) | 7 个 | 2 严重 + 2 高危 + 3 中危 |
| 📁 [文件上传漏洞分析与防护](#文件上传漏洞分析与防护) | 7 个 | 2 严重 + 2 高危 + 2 中危 |
| 🏦 [业务逻辑漏洞与越权分析](#业务逻辑漏洞与越权分析) | 8 个 | 4 严重 + 2 高危 + 2 中危 |
| 📄 [文件包含漏洞分析与防护](#文件包含漏洞分析与防护) | 5 个 | 2 严重 + 1 高危 + 2 中危 |
| 🔒 [CSRF 跨站请求伪造分析](#csrf-跨站请求伪造分析) | 5 个 | 2 高危 + 3 中危 |
| **总计** | **34 个** | **全部修复** |

---

## 🛡️ Web 安全审计与加固
**报告：** [web-security-audit/](./web-security-audit/) | 8 个漏洞 | SQL 注入、密码明文、CSRF、Cookie 等

## 🔒 密码安全修复
**报告：** [password-security-audit/](./password-security-audit/) | 7 个漏洞 | 密码明文、弱密钥、爆破防护等

## 📁 文件上传漏洞分析与防护
**报告：** [file-upload-audit/](./file-upload-audit/) | 7 个漏洞 | 任意文件上传、路径穿越、XSS 等

## 🏦 业务逻辑漏洞与越权分析
**报告：** [business-logic-audit/](./business-logic-audit/) | 8 个漏洞 | IDOR 越权、负值充值、超额充值等

## 📄 文件包含漏洞分析与防护
**报告：** [file-inclusion-audit/](./file-inclusion-audit/) | 5 个漏洞 | LFI、RFI、敏感信息泄露、XSS 等

## 🔒 CSRF 跨站请求伪造分析
**报告：** [csrf-audit/](./csrf-audit/) | [CSRF跨站请求伪造漏洞分析与防护报告.md](./CSRF跨站请求伪造漏洞分析与防护报告.md) | [CSRF跨站请求伪造漏洞分析与防护报告.pdf](./CSRF跨站请求伪造漏洞分析与防护报告.pdf)

全部 5 个 POST 接口 CSRF 防护审计。涵盖登录、注册、上传、充值、修改密码接口的 CSRF 漏洞修复。

### 发现的漏洞
| # | 漏洞名称 | 严重程度 | 路由 |
|---|---------|---------|------|
| 1 | **登录接口 CSRF 缺失** | 🟡 中危 | POST /login |
| 2 | **注册接口 CSRF 缺失** | 🟡 中危 | POST /register |
| 3 | **上传接口 CSRF 缺失** | 🟡 中危 | POST /upload |
| 4 | **充值接口 CSRF 缺失** | 🟠 高危 | POST /recharge |
| 5 | **修改密码接口 CSRF 缺失** | 🟠 高危 | POST /change-password |

### 修复措施
- 全部 5 个 POST 接口添加 `validate_csrf()` Token 校验
- 全部 5 个接口添加 `refresh_csrf()` 一次性 Token 防重放
- SameSite=Lax Cookie 属性双重防护
- change-password 同时修复 IDOR 越权 + 密码强度

---

## 🗂️ 项目结构 | Project Structure
```
flask-password-security-audit/
├── index.html                     # 项目首页（6 个报告入口）
├── web-security-audit/            # Web 安全审计与加固
├── password-security-audit/       # 密码安全修复
├── file-upload-audit/             # 文件上传漏洞分析
├── business-logic-audit/          # 业务逻辑与越权分析
├── file-inclusion-audit/          # 文件包含漏洞分析
├── csrf-audit/                    # CSRF 跨站请求伪造分析 ★ 新增
├── README.md
├── 密码安全修复报告.md/.pdf
├── Web安全审计与加固报告.md/.pdf
├── 文件上传漏洞分析与防护报告.md/.pdf
├── 业务逻辑与越权漏洞分析报告.md/.pdf
├── 文件包含漏洞分析与防护报告.md/.pdf
└── CSRF跨站请求伪造漏洞分析与防护报告.md/.pdf
```

---

## 🔬 使用工具 | Tools Used
| 工具 | 用途 |
|------|------|
| Flask / Werkzeug | Web 框架 / 密码哈希（scrypt）|
| SQLite 3 | 数据库 |
| Burp Suite CE | 代理抓包 / Repeater / Intruder |
| Kali Linux | 测试环境 |

---

## 📄 许可 | License
MIT License — &copy; 2026 Zhaoyang-haha
