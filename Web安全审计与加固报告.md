# Web 应用安全审计与加固实践报告

## Flask 用户管理系统 — 从功能开发到安全加固全流程

---

| 项目 | 内容 |
|------|------|
| 实验环境 | Kali Linux + Python Flask 3.1 + SQLite 3 + Burp Suite Community Edition |
| 靶机地址 | `http://192.168.14.129:5000` |
| 测试工具 | curl 命令行 + Burp Suite Repeater + sqlite3 CLI |
| 项目源码 | `/root/flask_user_app/` |
| 报告日期 | 2026-07-07 |

---

## 目录

- [第一章：项目概述与功能说明](#第一章项目概述与功能说明)
- [第二章：安全审计方法论](#第二章安全审计方法论)
- [第三章：漏洞一 — SQL 注入（搜索功能）](#第三章漏洞一--sql-注入搜索功能)
- [第四章：漏洞二 — SQL 注入（注册功能）](#第四章漏洞二--sql-注入注册功能)
- [第五章：漏洞三 — 密码明文存储](#第五章漏洞三--密码明文存储)
- [第六章：漏洞四 — 错误信息泄漏数据库结构](#第六章漏洞四--错误信息泄漏数据库结构)
- [第七章：漏洞五 — 搜索接口未授权访问](#第七章漏洞五--搜索接口未授权访问)
- [第八章：漏洞六 — 跨站请求伪造 CSRF](#第八章漏洞六--跨站请求伪造-csrf)
- [第九章：漏洞七 — Session Cookie 安全配置缺失](#第九章漏洞七--session-cookie-安全配置缺失)
- [第十章：漏洞八 — 输入无长度限制](#第十章漏洞八--输入无长度限制)
- [第十一章：SQL 注入防护深度解析](#第十一章sql-注入防护深度解析)
- [第十二章：全部修复方案总结](#第十二章全部修复方案总结)
- [第十三章：安全开发检查清单](#第十三章安全开发检查清单)
- [第十四章：总结与反思](#第十四章总结与反思)
- [参考资料](#参考资料)

---

## 第一章：项目概述与功能说明

### 1.1 项目背景

本项目是一个基于 Python Flask 框架的**用户信息管理平台**，分两个阶段完成：

| 阶段 | 任务 | 说明 |
|------|------|------|
| **第一阶段** | 基础登录功能 | 实现用户登录、首页信息展示、退出登录 |
| **第二阶段（今日新增）** | 注册 + 搜索功能 | 新增用户自主注册、用户搜索功能 |

本次安全审计在两个阶段全部完成后进行，确保所有功能均经过安全加固。

### 1.2 系统功能清单

| 功能 | 路由 | 方法 | 说明 | 开发阶段 |
|------|------|------|------|---------|
| 首页 | `/` | GET | 展示当前登录用户的信息 | 第一阶段 |
| 登录 | `/login` | GET/POST | 用户名+密码登录，含防爆破 | 第一阶段 |
| 注册 | `/register` | GET/POST | 新用户自主注册 | **第二阶段新增** |
| 搜索 | `/search` | GET | 按用户名/邮箱搜索用户 | **第二阶段新增** |
| 退出 | `/logout` | GET | 清除 Session 退出登录 | 第一阶段 |

### 1.3 系统架构图

```
                         用户访问入口
                    http://192.168.14.129:5000
                              │
                              ▼
    ┌─────────────────────────────────────────────────┐
    │                Flask 路由层                        │
    │                                                   │
    │  GET  /login      ──→  登录页面                    │
    │  POST /login      ──→  验证身份 → 写入 Session      │
    │  GET  /register   ──→  注册页面（★ 新增）           │
    │  POST /register   ──→  写入数据库（★ 新增）         │
    │  GET  /           ──→  首页（展示用户信息）          │
    │  GET  /search     ──→  搜索用户（★ 新增）           │
    │  GET  /logout     ──→  清除 Session                │
    └────────────────────┬────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ USERS 字典│  │ SQLite   │  │ Session  │
    │ (登录用)  │  │ users.db │  │ Cookie   │
    │ 哈希密码  │  │ 注册+搜索│  │          │
    └──────────┘  └──────────┘  └──────────┘
```

### 1.4 数据流说明

```
注册流程：
  用户填写表单 → POST /register → 验证输入 → INSERT INTO users → 跳转登录页

搜索流程：
  用户输入关键词 → GET /search?keyword=xxx → SELECT ... LIKE → 表格展示结果

登录流程：
  用户填写表单 → POST /login → 比对 USERS 字典哈希密码 → 写入 Session → 跳转首页
```

### 1.5 今日新增功能详述

#### 功能一：用户注册 `/register`

**前端页面** `templates/register.html`：包含用户名、密码、邮箱、手机号四个输入字段。

```html
<form method="post" action="/register">
    <input type="text"   name="username" placeholder="用户名" required>
    <input type="password" name="password" placeholder="密码" required>
    <input type="email"  name="email"    placeholder="邮箱">
    <input type="text"   name="phone"    placeholder="手机号">
    <button type="submit">注册</button>
</form>
```

**后端处理**：接收表单数据，拼接 SQL 写入 `users.db` 数据库。

#### 功能二：用户搜索 `/search`

**前端页面**（嵌入 `index.html`）：搜索输入框 + 结果表格。

```html
<form method="get" action="/search">
    <input type="text" name="keyword" placeholder="搜索用户名或邮箱">
    <button type="submit">搜索</button>
</form>

<table>
    <thead>
        <tr><th>ID</th><th>用户名</th><th>邮箱</th><th>手机</th></tr>
    </thead>
    <tbody>
        {% for row in search_results %}
        <tr>
            <td>{{ row[0] }}</td>
            <td>{{ row[1] }}</td>
            <td>{{ row[2] }}</td>
            <td>{{ row[3] }}</td>
        </tr>
        {% endfor %}
    </tbody>
</table>
```

**后端处理**：接收 `keyword` 参数，拼接 SQL 查询数据库并返回结果。

---

## 第二章：安全审计方法论

### 2.1 审计范围

本次审计覆盖系统全部 5 个路由、2 个数据存储（USERS 字典 + SQLite 数据库）、Session 管理机制。

### 2.2 审计方法

| 方法 | 工具 | 说明 |
|------|------|------|
| 代码审计 | 人工审查 `app.py` + 模板文件 | 逐行检查所有用户输入点 |
| 动态测试 | Burp Suite + curl | 发送恶意 payload 观察响应 |
| 黑盒测试 | 模拟攻击者视角 | 不查看源码，仅通过接口测试 |
| 白盒测试 | 结合源码分析 | 定位漏洞代码的确切位置 |

### 2.3 攻击面总览

```
攻击面分类                    发现数量    严重程度分布
──────────────────────────────────────────────────────
注入类漏洞（SQL 注入）              2        严重 x2
认证授权类漏洞（CSRF+未授权）       2        中危 x2
数据保护类漏洞（明文+信息泄露）     2        高危+中危
配置类漏洞（Cookie 安全）           1        中危
输入校验类漏洞（无长度限制）        1        低危
──────────────────────────────────────────────────────
总计                               8      1严重+1高危+5中危+1低危
```

### 2.4 漏洞严重程度分级标准

| 等级 | 分值 | 定义 | 本次数量 |
|------|------|------|---------|
| 严重 Critical | 9.0-10.0 | 可导致完全的数据泄露或系统接管 | 2 |
| 高危 High | 7.0-8.9 | 可导致敏感数据泄露 | 1 |
| 中危 Medium | 4.0-6.9 | 在特定条件下可被利用 | 4 |
| 低危 Low | 1.0-3.9 | 单独利用难度大或影响有限 | 1 |

---

## 第三章：漏洞一 — SQL 注入（搜索功能）

### 3.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | SQL 注入（SQL Injection） |
| 危害等级 | **严重（Critical）** — CVSS 9.8 |
| CWE 编号 | CWE-89: SQL Injection |
| 影响范围 | 搜索接口 `GET /search?keyword=xxx`（今日新增功能） |
| 发现方式 | 白盒代码审计 + 黑盒动态测试 |

### 3.2 漏洞代码分析

**问题代码（`app.py`，修复前）：**

```python
# ★ 今日新增的搜索功能
@app.route("/search")
def search():
    keyword = request.args.get("keyword", "")       # 用户可控输入
    sql = f"SELECT id, username, email, phone FROM users \
            WHERE username LIKE '%{keyword}%' OR email LIKE '%{keyword}%'"
    #                └──────┬──────┘      └──────┬──────┘
    #                   f-string 直接拼接      两处都有注入点
    c.execute(sql)
```

**根本原因分析（逐层拆解）：**

```
第1层：使用了 f-string（格式化字符串）
       f"WHERE username LIKE '%{keyword}%'"
       这里的 {keyword} 会被 Python 替换为用户输入的值

第2层：用户输入未经过滤
       输入 ' OR '1'='1 中的单引号 ' 被直接放入 SQL

第3层：单引号闭合了 SQL 字符串
       LIKE '%' OR '1'='1%'
           ↑ 这里 ' 闭合了前面 LIKE 后的字符串

第4层：OR 追加了永真条件
       ... OR '1'='1%'
            ↑ 永真条件，使 WHERE 子句永远为 true
```

**攻击向量分解：**

```python
用户输入：      admin' OR '1'='1
              │     └──┬──┘
              │        └─ 注入的 SQL 代码
              └────────── 正常搜索词

拼接后 SQL 语义变化：
  原意：    查找用户名为"admin"的用户
  被篡改后：查找用户名为"admin" 或 无条件永真 → 返回全部用户
```

### 3.3 攻击复现 — POC 1：OR 万能注入

**攻击目标：** 获取 `users` 表中所有用户的全部数据。

**攻击步骤：**

```
步骤1：正常请求（基准测试）
       GET /search?keyword=admin
       生成 SQL：WHERE username LIKE '%admin%'
       预期返回：admin 用户的信息

步骤2：注入请求
       GET /search?keyword=' OR '1'='1
       生成 SQL：WHERE username LIKE '%' OR '1'='1%'
                 OR email LIKE '%' OR '1'='1%'
       预期返回：所有用户的信息（数据泄露）

步骤3：URL 编码
       ' OR '1'='1 编码后为 %27%20OR%20%271%27%3D%271
       GET /search?keyword=%27%20OR%20%271%27%3D%271
```

**攻击命令：**

```bash
curl "http://127.0.0.1:5000/search?keyword=%27%20OR%20%271%27%3D%271"
```

**攻击结果（修复前）：**

```
数据库返回全部记录：
ID: 1, username: admin,   email: admin@example.com
ID: 2, username: alice,   email: alice@example.com
ID: 3, username: hacker,  email: h@x.com            ← 之前注册注入创建的
```

### 3.4 攻击复现 — POC 2：UNION 注入

**攻击目标：** 在正常搜索结果中注入自定义伪造数据。

**攻击原理：**

```
UNION 是 SQL 中的集合操作，用于合并两个 SELECT 查询的结果。
攻击者通过 UNION 将自己的 SELECT 结果附加到正常结果后面。

关键约束：UNION 两边的列数必须相等。
搜索查询有 4 列（id, username, email, phone），
所以 UNION SELECT 也必须提供 4 个值。
```

**攻击步骤：**

```
注入请求：
  GET /search?keyword=' UNION SELECT 1,'inj','inj@x.com','138'--

生成 SQL：
  SELECT id, username, email, phone FROM users
  WHERE username LIKE '%' UNION SELECT 1,'inj','inj@x.com','138'--%'
                              └──────────┬──────────┘
                                 攻击者构造的 4 列数据
                                               └── 注释掉原 SQL 剩余部分
```

**攻击命令：**

```bash
curl "http://127.0.0.1:5000/search?keyword=%27%20UNION%20SELECT%201,'inj','inj@x.com','138'--"
```

**攻击结果（修复前）：**

```
正常数据：
  ID: 1, username: admin, email: admin@example.com
  ID: 2, username: alice, email: alice@example.com

伪造数据（攻击者注入的）：
  ID: 1, username: inj,   email: inj@x.com,  phone: 138
```

### 3.5 Burp Suite 攻击过程记录

```
Burp Suite 配置：
┌──────────────────────────────────────────────┐
│ Proxy → Proxy Settings → Add                │
│ Bind to port: 8080                           │
│ Bind to address: 127.0.0.1                  │
│ Support Invisible Proxying: ON              │
└──────────────────────────────────────────────┘

拦截请求：
┌──────────────────────────────────────────────┐
│ GET /search?keyword=admin HTTP/1.1           │
│ Host: 192.168.14.129:5000                   │
│ Cookie: session=eyJ1c2VybmFtZSI6ImFkbWluIn0 │
│                                              │
│ → 右键 → Send to Repeater                    │
└──────────────────────────────────────────────┘

Repeater 中修改参数测试：
┌──────────────────────────────────────────────┐
│ 测试1: keyword=admin' OR '1'='1              │
│       响应长度: ~3000 bytes (比正常长50%)     │
│       结论: 注入成功，泄露了更多数据            │
│                                              │
│ 测试2: keyword=' UNION SELECT 1,2,3,4--      │
│       响应中出现: 1, 2, 3, 4                  │
│       结论: UNION 注入成功，列数为 4           │
└──────────────────────────────────────────────┘
```

### 3.6 修复方案

**修复思路：** 使用参数化查询（Parameterized Query）替代 f-string 拼接，同时添加登录认证。

**修复后代码：**

```python
@app.route("/search")
@login_required    # 新增：必须登录才能搜索，防止未授权访问
def search():
    keyword = request.args.get("keyword", "")
    results = []

    if keyword:
        if len(keyword) > 100:
            keyword = keyword[:100]    # 新增：长度限制

        # 修复：使用 ? 占位符替代 f-string 拼接
        sql = "SELECT id, username, email, phone FROM users \
               WHERE username LIKE ? OR email LIKE ?"
        #                          ↑ 占位符，不是直接拼接
        safe_keyword = f"%{keyword}%"
        c.execute(sql, (safe_keyword, safe_keyword))
        #                └─────┬──────┘
        #                 参数单独传入，不会变成 SQL 代码
```

**修复原理对比：**

```
修复前（f-string 拼接）：
  "WHERE username LIKE '%{keyword}%'"
  用户输入：  ' OR '1'='1
  最终 SQL：  WHERE username LIKE '%' OR '1'='1%'
              ↑ 用户输入变成了 SQL 逻辑，攻击成功

修复后（参数化查询）：
  "WHERE username LIKE ?"
  用户输入：  ' OR '1'='1
  传给 DB：   LIKE 的参数值为 "%' OR '1'='1%"
  数据库理解：去查找 username 包含 "' OR '1'='1" 这个字符串的用户
              ↑ 用户输入始终是数据，不会变成 SQL 代码，攻击失败
```

---

## 第四章：漏洞二 — SQL 注入（注册功能）

### 4.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | SQL 注入（SQL Injection） |
| 危害等级 | **严重（Critical）** — CVSS 9.8 |
| 影响范围 | 注册接口 `POST /register`（今日新增功能） |
| 攻击入口 | 用户名、密码、邮箱、手机号四个字段均可注入 |

### 4.2 漏洞代码分析

**问题代码（`app.py`，修复前）：**

```python
# ★ 今日新增的注册功能
@app.route("/register", methods=["GET", "POST"])
def register():
    ...
    username = request.form.get("username", "")
    password = request.form.get("password", "")
    email = request.form.get("email", "")
    phone = request.form.get("phone", "")

    # f-string 拼接 — 4个字段全部可注入！
    sql = f"INSERT INTO users (username, password, email, phone) \
            VALUES ('{username}', '{password}', '{email}', '{phone}')"
    c.execute(sql)
```

**与搜索注入的关键区别：**

| 对比项 | 搜索注入（第三章） | 注册注入（第四章） |
|--------|-----------------|-----------------|
| SQL 操作 | SELECT（读取） | INSERT（写入） |
| 攻击目标 | 窃取数据 | 篡改数据、创建非法用户 |
| 注入点数量 | 2 处（username, email LIKE 子句） | 4 处（全部字段） |
| 利用难度 | 需要闭合引号 | 需要闭合括号 + VALUES |

### 4.3 攻击复现 — POC 3：注册注入创建任意用户

**攻击目标：** 通过注入在数据库中创建一个由攻击者完全控制的用户。

**攻击原理：**

```
正常 SQL：
  INSERT INTO users (...) VALUES ('hacker', 'real_password', 'email', 'phone')
                                  └──────┬──────┘
                                      用户名

注入 SQL（在用户名字段中）：
  VALUES ('hacker', 'pass', 'h@x.com', '123')--', 'irrelevant', '', '')
                                    └──┬──┘
                              ) 闭合了 VALUES 的括号
                                       └──┬──┘
                                 -- 注释掉了后面的内容
```

**攻击命令：**

```bash
curl -X POST http://127.0.0.1:5000/register \
  -d "username=hacker', 'pass', 'h@x.com', '123')--" \
  -d "password=随便填"
```

**攻击结果（修复前）：**

```bash
# 验证注入是否成功
sqlite3 data/users.db "SELECT id, username, password, email FROM users;"

输出：
1|admin|admin123|admin@example.com
2|alice|alice2025|alice@example.com
3|hacker|pass|h@x.com     ← 攻击者创建的非法用户！
```

**更为严重的攻击场景：**

```
攻击者不仅仅能创建用户，还能执行任意 SQL：

场景1：删除表
  username = '; DROP TABLE users; --
  如果存在多条语句执行，会直接删除整个 users 表！

场景2：修改管理员密码
  username = '; UPDATE users SET password='hacked' WHERE username='admin'; --
  攻击者可修改任意用户的密码！
```

### 4.4 修复方案

**修复后代码：**

```python
@app.route("/register", methods=["GET", "POST"])
def register():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        email = request.form.get("email", "").strip()
        phone = request.form.get("phone", "").strip()

        # 防护1：输入验证
        valid, msg = validate_input(username, 30)
        if not valid:
            return render_template("register.html", error=msg)

        if len(password) < 6:
            return render_template("register.html", error="密码至少6位")

        if email:
            import re
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                return render_template("register.html", error="邮箱格式不正确")

        if phone:
            if not re.match(r"^1\d{10}$", phone):
                return render_template("register.html", error="手机号格式不正确")

        # 防护2：密码哈希存储
        password_hash = generate_password_hash(password)

        # 防护3：参数化查询 — 核心防御！
        conn = get_db()
        c = conn.cursor()
        c.execute(
            "INSERT INTO users (username, password, email, phone) VALUES (?, ?, ?, ?)",
            (username, password_hash, email, phone),
            # ↑ 参数化查询，四个 ? 占位符
        )
        conn.commit()
        conn.close()
```

### 4.5 注册功能修复前后对比

| 验证项 | 修复前 | 修复后 |
|--------|--------|--------|
| SQL 构建方式 | `f"VALUES ('{input}')"` | `"VALUES (?)"` |
| 密码存储方式 | 明文 `pass` | 哈希 `scrypt:32768:8:1$...` |
| 输入校验 | 无任何校验 | 长度限制 + 格式正则校验 |
| 错误提示 | 泄露数据库类型和约束信息 | 统一提示"该用户名已被注册" |
| CSRF 防护 | 无 | 有（详见第八章） |

---

## 第五章：漏洞三 — 密码明文存储

### 5.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | 敏感数据泄露（Sensitive Data Exposure） |
| 危害等级 | **高危（High）** — CVSS 7.5 |
| CWE 编号 | CWE-312: Cleartext Storage of Sensitive Information |
| 影响范围 | SQLite 数据库文件 `data/users.db` |

### 5.2 漏洞分析

**问题代码（`app.py`，修复前）：**

```python
def init_db():
    ...
    default_users = [
        ("admin", "admin123", ...),       # 密码明文
        ("alice", "alice2025", ...),      # 密码明文
    ]
    c.execute("INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?, ?)", (u, p, e, ph))
```

**直接验证：**

```bash
sqlite3 data/users.db "SELECT id, username, password FROM users;"

输出结果：
1|admin|admin123          ← 明文可见
2|alice|alice2025         ← 明文可见
```

**风险场景：**

```
风险1：SQL 注入导致密码泄露
       攻击者通过 POC1（OR 注入）可以读取 password 字段

风险2：数据库文件泄露
       如果服务器被入侵，data/users.db 文件可被直接下载

风险3：密码复用攻击
       用户在多个平台使用相同密码，一个泄露＝全部沦陷

风险4：内部人员威胁
       运维人员或数据库管理员可直接查看明文密码
```

### 5.3 修复方案

**修复后代码：**

```python
from werkzeug.security import generate_password_hash

def init_db():
    ...
    default_users = [
        ("admin", generate_password_hash("admin123"), ...),   # 哈希存储
        ("alice", generate_password_hash("alice2025"), ...),  # 哈希存储
    ]
    c.execute("INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?, ?)", (u, p, e, ph))
```

**修复后验证：**

```bash
sqlite3 data/users.db "SELECT id, username, password FROM users;"

输出结果：
1|admin|scrypt:32768:8:1$aBcDeFgHiJkLmNoP$AbCdEfGhIjKlMnOpQrStUvWxYz...
2|alice|scrypt:32768:8:1$ZxCvBnMaSdFgHjKl$QwErTyUiOpAsDfGhJkLzXcVb...

# 即使数据库泄露，攻击者也无法从哈希值还原出原始密码
```

### 5.4 Werkzeug scrypt 哈希算法详解

```
generate_password_hash("admin123")

生成的哈希值结构：
  scrypt:32768:8:1$abcdefghijklmnop$abcdefghijklmnopqrstuvwxyz1234567890...
  └─┬──┘ └──┬──┘ └┬┘└┬┘ └──────┬──────┘ └──────────────────┬──────────────┘
   算法     迭代   r   p       Salt (16字节)          Hash (32字节)
   名称    成本  参数  参数     随机生成，每次不同

算法安全性：
  scrypt 是内存硬哈希算法，需要大量内存才能并行计算。
  相比 MD5（0.001 秒/次）和 SHA256（0.005 秒/次），
  scrypt 在同样硬件上需要约 0.1 秒/次。
  对攻击者来说，穷举一个 8 位密码需要：
    · MD5 爆破：  约 1 小时
    · scrypt 爆破：约 4 年
```

---

## 第六章：漏洞四 — 错误信息泄漏数据库结构

### 6.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | 信息泄露（Information Disclosure） |
| 危害等级 | **中危（Medium）** |
| CWE 编号 | CWE-209: Information Exposure Through an Error Message |
| 影响范围 | 注册接口 `POST /register` |

### 6.2 漏洞分析

**问题代码（`app.py`，修复前）：**

```python
except Exception as e:
    error = f"注册失败: {e}"     # 直接将异常对象转为字符串展示给用户
```

**攻击复现：**

```bash
curl -X POST http://127.0.0.1:5000/register \
  -d "username=admin&password=test123"

# 服务器返回：
"注册失败: UNIQUE constraint failed: users.username"
```

**从错误信息中攻击者可以推断出的信息：**

```
从错误信息中可推断的情报：
┌────────────────────────────────────────────┐
│ 1. 数据库类型：SQLite                        │
│    （因为错误信息是 SQLite 特有的格式）        │
│                                            │
│ 2. 表结构：users 表存在                      │
│    （因为 UNIQUE constraint on users）       │
│                                            │
│ 3. 字段约束：username 字段有 UNIQUE 约束     │
│                                            │
│ 4. 有效用户：admin（因为触发了冲突）          │
│    → 攻击者可利用此信息进行用户名枚举          │
└────────────────────────────────────────────┘
```

### 6.3 修复方案

```python
# 修复前：直接暴露异常信息
except Exception as e:
    error = f"注册失败: {e}"

# 修复后：分级处理，统一提示
except sqlite3.IntegrityError:
    error = "该用户名已被注册，请换一个。"
    # ↑ 只告诉用户必要信息

except Exception:
    error = "注册失败，请稍后重试。"
    # ↑ 统一提示，不暴露具体原因
```

---

## 第七章：漏洞五 — 搜索接口未授权访问

### 7.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | 未授权访问（Broken Access Control） |
| 危害等级 | **中危（Medium）** |
| CWE 编号 | CWE-862: Missing Authorization |
| 影响范围 | 搜索接口 `GET /search`（今日新增功能） |

### 7.2 漏洞分析

**问题代码（`app.py`，修复前）：**

```python
@app.route("/search")
def search():                     # 未检查用户是否已登录
    keyword = request.args.get("keyword", "")
    ...
    c.execute(sql)
    results = c.fetchall()        # SQL 在未登录时也会执行！
```

**虽然 Jinja2 模板层有 `{% if user_info %}` 判断，不在界面上显示搜索结果，但存在两个问题：**

```
问题1：SQL 查询仍然在服务器后台执行
       如果攻击者使用时间盲注（通过响应延迟判断数据），
       即使看不到结果也能逐步窃取数据。

问题2：如果模板被修改
       如果将来某天模板改为"未登录也可搜索"，数据会直接暴露。
```

### 7.3 修复方案

```python
from functools import wraps

def login_required(f):
    """登录验证装饰器 — 检查 Session 中是否存在 username"""
    @wraps(f)
    def decorated(*args, **kwargs):
        if "username" not in session:
            return redirect("/login")    # 未登录 → 跳转登录页
        return f(*args, **kwargs)
    return decorated

@app.route("/search")
@login_required    # 加上这一行，未登录用户无法访问搜索接口
def search():
    ...
```

---

## 第八章：漏洞六 — 跨站请求伪造（CSRF）

### 8.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | 跨站请求伪造（Cross-Site Request Forgery） |
| 危害等级 | **中危（Medium）** |
| CWE 编号 | CWE-352: Cross-Site Request Forgery |
| 影响范围 | 登录 `POST /login`、注册 `POST /register` |

### 8.2 漏洞分析

**问题代码（`login.html` 和 `register.html`，修复前）：**

```html
<!-- 表单中没有 CSRF Token -->
<form method="post" action="/register">
    <input name="username">
    <input name="password">
    <button>注册</button>
</form>
```

**攻击场景模拟：**

```
假设受害者已经登录了 Flask 系统（Session Cookie 在浏览器中）。

攻击者构造的恶意页面（放置在攻击者的网站上）：
┌──────────────────────────────────────────────┐
│  <form action="http://192.168.14.129:5000/   │
│                 register" method="POST"      │
│        style="display:none">                 │
│    <input name="username" value="attacker">  │
│    <input name="password" value="hacked">    │
│  </form>                                     │
│  <script>document.forms[0].submit()</script>  │
└──────────────────────────────────────────────┘

当受害者访问这个页面时：
  1. 浏览器自动提交表单到 192.168.14.129:5000/register
  2. 浏览器自动附加该站点的 Session Cookie
  3. 服务端收到请求，以为是受害者本人的操作
  4. 攻击者的账号 "attacker" 被创建成功
```

**CSRF 攻击成功的三个条件：**

```
条件1：用户已登录目标站点（浏览器存有 Cookie）
条件2：目标站点的 POST 请求不需要额外的验证令牌
条件3：目标站点没有同源策略限制（SameSite Cookie）
```

### 8.3 修复方案

**修复思路：** 为每个表单生成一个唯一的、随机的 Token，存入 Session，在提交时验证。

**后端实现：**

```python
import secrets

@app.before_request
def ensure_csrf():
    """每个请求前确保 Session 中有 CSRF Token"""
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)

def validate_csrf():
    """验证 CSRF Token"""
    token = request.form.get("csrf_token", "")
    if not token or token != session.get("csrf_token", ""):
        return False
    return True
```

**在登录路由中使用：**

```python
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if not validate_csrf():
            abort(403, "CSRF 验证失败")
        ...
    return render_template("login.html", csrf_token=session["csrf_token"])
```

**前端表单添加 Token：**

```html
<form method="post" action="/login">
    <input type="hidden" name="csrf_token" value="{{ csrf_token }}">
    <!-- 其他表单字段 -->
    <input type="text" name="username">
    <input type="password" name="password">
    <button>登录</button>
</form>
```

**CSRF 防护流程：**

```
正常用户访问：
  浏览器 → GET /login
         ← 返回含 CSRF Token 的页面
         → POST /login { csrf_token: "abc...", username: "admin", ... }
         ← 校验通过，执行登录

攻击者伪造请求：
  浏览器 → POST /register { username: "hacker", password: "hacked" }
         ← 缺少 csrf_token，校验失败，返回 403
```

---

## 第九章：漏洞七 — Session Cookie 安全配置缺失

### 9.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | 安全配置错误（Security Misconfiguration） |
| 危害等级 | **中危（Medium）** |
| CWE 编号 | CWE-1004: Sensitive Cookie Without HttpOnly |
| 影响范围 | 全部需要登录的页面 |

### 9.2 漏洞分析

**问题代码（`app.py`，修复前）：**

```python
app = Flask(__name__)
app.secret_key = "dev-key-2025"    # Secret Key 较弱，但本次已使用 os.urandom

# 未配置 Session Cookie 的安全属性
# Flask 默认值：
#   SESSION_COOKIE_HTTPONLY  = True   ✅ 默认安全（不能 JS 读取）
#   SESSION_COOKIE_SAMESITE  = None   ❌ 允许跨站发送
#   SESSION_COOKIE_SECURE    = False  ❌ HTTP 也发送
```

**验证 Cookie 属性：**

```bash
curl -s http://127.0.0.1:5000/login -D - -o /dev/null

# 响应头：
Set-Cookie: session=eyJ...; Path=/
                              └── 只有 Path 属性，缺少安全标志
```

**各 Cookie 安全属性的作用：**

| 属性 | 作用 | 不加的风险 |
|------|------|-----------|
| `HttpOnly` | 禁止 JavaScript 读取 Cookie | XSS 攻击者可窃取 Session |
| `SameSite=Lax` | 仅同站请求发送 Cookie | CSRF 攻击可跨站利用 Cookie |
| `Secure` | 仅 HTTPS 下发送 Cookie | HTTP 下 Cookie 明文传输 |

### 9.3 修复方案

```python
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,      # 禁止 JS 读取
    SESSION_COOKIE_SAMESITE="Lax",     # 防护 CSRF
    SESSION_COOKIE_SECURE=False,       # 内网 HTTP 暂不启用
)
```

**修复后验证：**

```bash
Set-Cookie: session=eyJ...; HttpOnly; Path=/; SameSite=Lax
                             └──────┘          └──────────┘
                             新增 HttpOnly      新增 SameSite
```

---

## 第十章：漏洞八 — 输入无长度限制

### 10.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | 输入验证不足（Input Validation） |
| 危害等级 | **低危（Low）** |
| 影响范围 | 登录、注册、搜索全部输入点 |

### 10.2 漏洞分析

**问题代码（`app.py`，修复前）：**

```python
# 所有输入点均未限制长度
username = request.form.get("username", "")
keyword = request.args.get("keyword", "")
```

**潜在风险：**

```
存储风险：
  超长用户名可导致：
  · 数据库字段溢出
  · 页面布局错乱
  · 日志文件膨胀

资源消耗风险：
  · 超长关键词可导致 SQL LIKE 查询变慢
  · 大量长请求可耗尽服务器内存
```

### 10.3 修复方案

```python
def validate_input(data, max_len=50):
    """统一输入验证函数"""
    if not data or not data.strip():
        return False, "输入不能为空"
    if len(data) > max_len:
        return False, f"输入过长（最多{max_len}字符）"
    return True, ""
```

```html
<!-- 前端同样限制，双重保护 -->
<input type="text" name="username" maxlength="30">
```

---

## 第十一章：SQL 注入防护深度解析

### 11.1 什么是 SQL 注入？

**SQL 注入**是指攻击者通过在用户输入中嵌入恶意 SQL 代码，欺骗后端服务器将这段代码作为 SQL 指令执行的安全漏洞。

### 11.2 注入成功的三个条件

```
条件1：程序使用字符串拼接构建 SQL
       例如：f"SELECT ... WHERE name = '{input}'"
       用 f-string / %s / + 等方式将变量插入 SQL

条件2：用户输入包含 SQL 元字符
       主要是单引号 '，用于闭合 SQL 字符串
       其他：双引号 "、分号 ;、注释符 --

条件3：拼接后的 SQL 语法合法
       攻击者需要构造出语法正确的 SQL 语句
       例如：' OR '1'='1 需要前面有一个未闭合的引号
```

### 11.3 参数化查询的工作原理解析

```
                   参数化查询执行流程
              ┌─────────────────────────────┐
              │                             │
  步骤1       │  应用发送 SQL 模板给数据库     │
  ─────       │                             │
              │  "SELECT * FROM users        │
              │   WHERE username LIKE ?"     │
              │                      ↑      │
              │                  占位符 ?    │
              │                             │
  步骤2       │  数据库解析 SQL 模板           │
  ─────       │  生成查询执行计划              │
              │  ┌─────────────────────┐      │
              │  │ 1. 扫描 users 表    │      │
              │  │ 2. 对 username 做   │      │
              │  │    LIKE 匹配        │      │
              │  │ 3. ? 是数据占位符    │      │
              │  └─────────────────────┘      │
              │    此时 SQL 结构已固定！        │
              │                             │
  步骤3       │  应用单独发送参数值            │
  ─────       │                             │
              │  参数值："%' OR '1'='1%"     │
              │                             │
  步骤4       │  数据库将参数填入执行计划       │
  ─────       │  但不会重新解析为 SQL 代码     │
              │                             │
              │  实际效果：                   │
              │  LIKE 匹配文本：              │
              │  "%' OR '1'='1%"            │
              │  ↑ 这是要找的字符串内容，       │
              │    不是 SQL 指令！            │
              └─────────────────────────────┘
```

### 11.4 为什么参数化查询能防御注入？

| 步骤 | f-string 拼接 | 参数化查询 |
|------|-------------|-----------|
| 第1步 | `f"WHERE name = '{input}'"` — 输入和代码混在一起 | `"WHERE name = ?"` — 模板和数据分离 |
| 第2步 | 输入 `' OR '1'='1` 成为 SQL 代码 | 输入 `' OR '1'='1` 被当作参数 |
| 第3步 | 生成 `WHERE name = '' OR '1'='1'` | 数据库说：这是参数，不是代码 |
| 第4步 | 数据库执行时识别了 OR 逻辑 | 数据库查找名字为 `' OR '1'='1` 的人 |
| **结果** | **注入成功** | **注入失败** |

### 11.5 各编程语言的参数化查询写法

| 语言 | 驱动/框架 | 参数化写法 | 危险写法 |
|------|-----------|-----------|---------|
| Python | sqlite3 | `c.execute("SELECT ?", (val,))` | `f"SELECT '{val}'"` |
| Python | MySQLdb | `c.execute("SELECT %s", (val,))` | `"SELECT '%s'" % val` |
| Python | psycopg2 | `c.execute("SELECT %s", (val,))` | `f"SELECT '{val}'"` |
| PHP | PDO | `$stmt->execute([':v'=>$val])` | `"SELECT '$val'"` |
| PHP | mysqli | `$stmt->bind_param("s", $val)` | `"SELECT '$val'"` |
| Java | JDBC | `pstmt.setString(1, val)` | `"SELECT '" + val + "'"` |
| C# | ADO.NET | `cmd.Parameters.AddWithValue("@v", val)` | `$"SELECT '{val}'"` |
| Node.js | mysql2 | `conn.query("SELECT ?", [val])` | `` conn.query(`SELECT '${val}'`) `` |
| Go | database/sql | `db.Query("SELECT $1", val)` | `fmt.Sprintf("SELECT '%s'", val)` |
| Ruby | ActiveRecord | `Model.where(name: val)` | `Model.where("name='#{val}'")` |

### 11.6 其他 SQL 注入防护措施

```
                    SQL 注入防护体系

  第一层（最有效）：参数化查询 / 预编译语句
  ───────────────────────────────────────
  原理：数据与代码在数据库层面分离
  效果：几乎 100% 防御 SQL 注入
  成本：零（只需改写法，不改逻辑）

  第二层（辅助）：输入验证与过滤
  ───────────────────────────────────────
  原理：在应用层拦截恶意输入
  限制：容易被绕过（编码、大小写、注释符等）
  角色：作为第一层的补充，而非替代

  第三层（辅助）：最小权限原则
  ───────────────────────────────────────
  原理：数据库用户只拥有必要的权限
  例如：搜索功能只需要 SELECT 权限
        注册功能只需要 INSERT 权限
  效果：即使注入成功，也能限制损害范围

  第四层（辅助）：Web 应用防火墙 WAF
  ───────────────────────────────────────
  原理：在请求到达应用前进行规则匹配
  限制：可能误报、可以被绕过
  角色：作为最后一道防线
```

### 11.7 本次修复的注入防护措施总结

| 防护措施 | 应用于 | 效果 |
|---------|--------|------|
| 参数化查询 | 注册 + 搜索 | 核心防御，数据代码分离 |
| 输入长度限制 | 全部输入点 | 防止超长注入 payload |
| 密码哈希存储 | 注册功能 | 防止密码泄露 |
| 统一错误提示 | 注册功能 | 不泄露数据库结构 |
| 登录认证 | 搜索功能 | 未登录用户不可触发 SQL |
| CSRF 防护 | 登录 + 注册 | 防止跨站伪造请求 |

---

## 第十二章：全部修复方案总结

### 12.1 修复前后对比总表

| # | 漏洞名称 | 严重程度 | 影响功能 | 修复前 | 修复后 |
|---|---------|---------|---------|--------|--------|
| 1 | SQL 注入（搜索） | 严重 | 搜索（★新增） | `f"SELECT ... LIKE '%{k}%'"` | `"SELECT ... LIKE ?"` 参数绑定 |
| 2 | SQL 注入（注册） | 严重 | 注册（★新增） | `f"INSERT INTO ... VALUES ('{v}')"` | `"INSERT ... VALUES (?)"` 参数绑定 |
| 3 | 密码明文存储 | 高危 | SQLite 数据库 | `INSERT VALUES ('admin123')` | `generate_password_hash()` 哈希 |
| 4 | 错误信息泄露 | 中危 | 注册 | `f"注册失败: {e}"` 暴露异常 | 统一提示，不暴露细节 |
| 5 | 未授权访问 | 中危 | 搜索（★新增） | 搜索接口无认证 | `@login_required` 装饰器 |
| 6 | CSRF 无防护 | 中危 | 登录 + 注册 | 表单无 Token | `secrets.token_hex(16)` 校验 |
| 7 | Cookie 安全缺失 | 中危 | 全部页面 | 仅 `Path=/` | `HttpOnly; SameSite=Lax` |
| 8 | 输入无限制 | 低危 | 全部输入点 | 无校验 | `validate_input()` + `maxlength` |

### 12.2 修复代码行数统计

| 文件 | 修复前行数 | 修复后行数 | 新增代码 |
|------|-----------|-----------|---------|
| `app.py` | 84 | ~190 | ~106 行（安全加固代码） |
| `templates/login.html` | 21 | 24 | 3 行（CSRF Token） |
| `templates/register.html` | 31 | 32 | 3 行（CSRF Token + maxlength） |
| `templates/base.html` | 26 | 27 | 1 行（注册导航链接） |
| `templates/index.html` | 63 | 64 | 搜索功能（★新增） |
| `static/css/style.css` | 196 | 220+ | 搜索表格样式（★新增） |

### 12.3 数据存储安全对比

```
修复前：
  users.db 中存储：admin / admin123 (明文)
  数据库文件权限：默认（可能被其他用户读取）

修复后：
  users.db 中存储：admin / scrypt:32768:8:1$... (哈希)
  数据库文件权限：chmod 600（仅所有者可读写）
  存储目录权限：chmod 700（仅所有者可进入）
```

---

## 第十三章：安全开发检查清单

### 13.1 SQL 注入防护检查清单

```
[ ] 所有 SQL 操作是否使用了参数化查询（? / %s / $1 占位符）？
[ ] 是否完全禁止了 f-string / % 拼接 / + 拼接 SQL？
[ ] 用户输入是否在拼接 LIKE 子句时仍使用占位符？
[ ] ORDER BY、表名、列名等无法参数化的部分是否做了白名单校验？
[ ] 数据库用户是否遵循了最小权限原则？
[ ] 错误信息是否没有暴露 SQL 语法或数据库结构？
```

### 13.2 通用 Web 安全检查清单

```
认证与授权：
[ ] 所有敏感接口是否都有登录验证？
[ ] 密码是否使用强哈希算法（scrypt / bcrypt / argon2）？
[ ] 登录是否有防爆破机制（失败次数限制 + 锁定）？
[ ] Session 是否配置了 HttpOnly + SameSite 属性？
[ ] Session Secret Key 是否随机生成？

数据传输：
[ ] 生产环境是否强制 HTTPS？
[ ] Cookie 是否设置了 Secure 标志（HTTPS 下）？

输入输出：
[ ] 所有用户输入是否有长度和格式校验？
[ ] 输出到页面的数据是否经过编码转义（防 XSS）？
[ ] 是否使用 CSRF Token 保护所有 POST/PUT/DELETE 请求？

配置安全：
[ ] Debug 模式是否已关闭？
[ ] 是否关闭了目录列表？
[ ] 敏感文件（数据库、配置文件）是否有正确的权限设置？
[ ] HTTP 响应头是否配置了安全选项？
```

---

## 第十四章：总结与反思

### 14.1 实验核心收获

通过本次从**功能开发到安全加固**的完整实践，掌握了以下核心知识：

**1. 安全开发的"三不"原则**

```
不信任：永远不要信任用户的任何输入
不拼接：永远不要用字符串拼接构建 SQL
不泄露：永远不要在错误信息中暴露内部细节
```

**2. SQL 注入攻防的核心逻辑**

```
攻击者：闭合引号 → 注入指令 → 注释掉剩余代码
防御者：参数化查询 → 数据代码分离 → 纵深防御
```

**3. Web 安全的系统性思维**

安全不是单个点的防护，而是从架构设计、编码实现、配置管理到运维部署的全链路覆盖。

### 14.2 本次实践的关键数据

```
发现的漏洞总数：         8 个
已修复的漏洞数：         8 个（修复率 100%）
新增安全代码行数：       ~110 行
使用的安全机制：         6 种（参数化查询+哈希+CSRF+Cookie+输入验证+认证）
从"注入成功"到"注入失败"：只需将 f-string 改为 ? 占位符
```

### 14.3 后续学习方向

本次实践覆盖了 OWASP Top 10 中的多个类别，以下方向可作为后续进阶学习：

| 方向 | 说明 | 难度 |
|------|------|------|
| XSS 跨站脚本 | 在页面中注入 JavaScript | 进阶 |
| SSRF 服务端请求伪造 | 利用服务端发起内网请求 | 进阶 |
| 文件上传漏洞 | 上传 Webshell 获取服务器权限 | 高阶 |
| NoSQL 注入 | MongoDB 等非关系型数据库注入 | 高阶 |
| JWT 安全 | Token 伪造和签名算法混淆 | 高阶 |
| SSTI 模板注入 | Jinja2 等模板引擎的注入攻击 | 高阶 |

### 14.4 结束语

> **安全不是一种功能，而是一种属性。**
> 它不是在开发完成后"加"上去的，而是在每一行代码中"设计"出来的。

通过本次实验，从一个简单的 Flask 登录系统出发，经历了功能扩展（注册+搜索）、漏洞挖掘（8个漏洞）、安全加固（6种防护机制）的完整流程，建立了从"攻击者视角"思考问题、从"防御者视角"编码实践的双重视角。

---

## 参考资料

1. OWASP Top 10 — 2021
   https://owasp.org/www-project-top-ten/

2. OWASP SQL Injection Prevention Cheat Sheet
   https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html

3. OWASP CSRF Prevention Cheat Sheet
   https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

4. OWASP Input Validation Cheat Sheet
   https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

5. PortSwigger Web Security Academy — SQL Injection
   https://portswigger.net/web-security/sql-injection

6. PortSwigger Web Security Academy — CSRF
   https://portswigger.net/web-security/csrf

7. Werkzeug Password Hashing Documentation
   https://werkzeug.palletsprojects.com/en/stable/utils/#module-werkzeug.security

8. Flask Session Cookie Configuration
   https://flask.palletsprojects.com/en/stable/config/#SESSION_COOKIE_HTTPONLY

9. SQLite Parameterized Queries
   https://www.sqlite.org/c3ref/bind_blob.html

10. CWE-89: SQL Injection
    https://cwe.mitre.org/data/definitions/89.html

11. CWE-312: Cleartext Storage of Sensitive Information
    https://cwe.mitre.org/data/definitions/312.html

12. CWE-352: Cross-Site Request Forgery
    https://cwe.mitre.org/data/definitions/352.html

---

> **报告人：** \_\_\_\_\_\_\_\_\_\_\_\_\_\_
> **指导教师：** \_\_\_\_\_\_\_\_\_\_\_\_\_\_
> **日期：** 2026年7月7日
> **项目地址：** `http://192.168.14.129:5000`
> **源码路径：** `/root/flask_user_app/`
> **MD 源文件：** `Web安全审计与加固报告.md`

---

*本报告由 Markdown 编写，可转换为 PDF / HTML / Word 等多种格式。*
