# CSRF 跨站请求伪造漏洞分析与防护报告

## Flask 用户管理系统 -- 全功能 CSRF 防护审计记录

---

| 项目 | 内容 |
|------|------|
| 实验环境 | Kali Linux 2026.1 + Python Flask 3.1 + Burp Suite Community Edition |
| 靶机地址 | `http://192.168.14.129:5000` |
| 测试工具 | curl 命令行 + Burp Suite Repeater |
| 审计范围 | 全部 5 个 POST 路由的 CSRF 防护 |
| 项目源码 | `/root/flask_user_app/` |
| 报告日期 | 2026-07-14 |

---

## 目录

- [第一章：实验概述](#第一章实验概述)
- [第二章：CSRF 漏洞基础理论](#第二章csrf-漏洞基础理论)
- [第三章：本次项目全功能 CSRF 审计](#第三章本次项目全功能-csrf-审计)
- [第四章：漏洞一 -- 登录接口 CSRF 缺失](#第四章漏洞一--登录接口-csrf-缺失)
- [第五章：漏洞二 -- 注册接口 CSRF 缺失](#第五章漏洞二--注册接口-csrf-缺失)
- [第六章：漏洞三 -- 上传接口 CSRF 缺失](#第六章漏洞三--上传接口-csrf-缺失)
- [第七章：漏洞四 -- 充值接口 CSRF 缺失](#第七章漏洞四--充值接口-csrf-缺失)
- [第八章：漏洞五 -- 修改密码接口 CSRF 缺失](#第八章漏洞五--修改密码接口-csrf-缺失)
- [第九章：CSRF 防护方案](#第九章csrf-防护方案)
- [第十章：修复前后代码对比](#第十章修复前后代码对比)
- [第十一章：安全修复验证](#第十一章安全修复验证)
- [第十二章：总结与反思](#第十二章总结与反思)
- [参考资料](#参考资料)

---

## 第一章：实验概述

### 1.1 实验目的

1. 理解 **CSRF 跨站请求伪造**（Cross-Site Request Forgery）的攻击原理与危害
2. 掌握 CSRF 漏洞的检测方法（手工测试 + Burp Suite）
3. 掌握 **Synchronizer Token Pattern**（同步令牌模式）的防御实现
4. 对本项目全部 POST 接口进行完整的 CSRF 审计与修复
5. 结合防重放机制建立完整的请求安全防护体系

### 1.2 什么是 CSRF？

**跨站请求伪造（CSRF）** 是一种攻击方式，攻击者诱导已登录用户访问恶意页面，在该页面中**自动发起**对目标网站的请求，利用浏览器自动携带 Cookie 的机制，**冒充用户身份**执行非本意操作。

### 1.3 本次审计范围

本项目共有 **5 个 POST 接口**，本轮审计覆盖全部接口：

```
POST 路由                功能              CSRF 修复前     CSRF 修复后
──────────────────────────────────────────────────────────────
POST /login            用户登录             无             有
POST /register         用户注册             无             有
POST /upload           头像上传             无             有
POST /recharge         账户充值             无             有
POST /change-password  修改密码             无             有     * 本轮
```

### 1.4 CSRF 攻击在本项目的危害路径

```
攻击者诱导已登录用户访问恶意页面
            │
            ▼
    ┌──────────────────┐
    │ POST /recharge    │ → 攻击者给自己充值（用户付钱）
    │ user_id=1         │                     
    │ amount=10000      │
    └──────────────────┘
            │
    ┌──────────────────┐
    │ POST /register    │ → 攻击者用用户的 Cookie 创建新账号
    │ username=attacker │
    └──────────────────┘
            │
    ┌──────────────────┐
    │ POST /change-pwd  │ → 攻击者修改用户密码（账号被接管）
    │ username=admin    │
    │ new_password=hack │
    └──────────────────┘
            │
    ┌──────────────────┐
    │ POST /upload      │ → 攻击者上传恶意文件（WebShell/XSS）
    │ file=shell.php    │
    └──────────────────┘
```

---

## 第二章：CSRF 漏洞基础理论

### 2.1 CSRF 攻击成功的三个条件

```
条件1：用户已登录目标站点
       浏览器中存有有效的 Session Cookie
       Cookie: session=eyJ1c2VybmFtZSI6ImFkbWluIi...

条件2：目标站点的 POST 请求无额外校验
       表单中没有 CSRF Token
       服务端不验证请求来源

条件3：用户访问了攻击者控制的页面
       攻击者构造的页面自动提交表单
       <form action="http://target/recharge" method="POST">
```

### 2.2 CSRF 攻击原理图解

```
                      ┌─────────────┐
                      │  目标服务器   │
                      │  Flask App   │
                      └──────┬──────┘
         ① 登录成功           │
         返回 Session Cookie  │
              ▲              │ ③ 自动携带 Cookie
              │              │ 发送 POST 请求
              │              ▼
        ┌─────┴─────┐  ┌────────────┐
        │  受害者    │  │  攻击者页面 │
        │  (已登录)   │◀─│  (恶意表单) │
        └───────────┘  └────────────┘
              ② 诱导受害者访问
```

**攻击流程详解：**

```
步骤1：受害者登录目标网站，获得 Session Cookie
步骤2：攻击者发送诱导链接，受害者访问
步骤3：恶意页面自动提交表单到目标网站
步骤4：浏览器自动附带 Cookie，服务端以为是受害者操作
步骤5：攻击达成（充值/改密/发帖/etc.）
```

### 2.3 CSRF 与 XSS 的区别

| 对比维度 | CSRF | XSS |
|---------|------|-----|
| 攻击方式 | 利用身份凭证，伪造请求 | 注入恶意脚本 |
| 利用对象 | 用户的身份认证 | 浏览器对内容的信任 |
| 是否需要漏洞页面 | 不需要（任何页面可构造请求） | 需要（页面有 XSS 漏洞） |
| 防御方式 | CSRF Token + SameSite Cookie | 输入输出编码 + CSP |
| 用户交互 | 需要用户已登录 | 不需要登录 |

### 2.4 三种主流 CSRF 防护方案对比

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| **Synchronizer Token** | 表单嵌入随机 Token，服务端校验 | 最成熟、最可靠 | 需要修改所有表单 |
| **SameSite Cookie** | Cookie 设置 SameSite 属性 | 无需修改代码 | 旧浏览器不支持 |
| **Referer/Origin 校验** | 检查 HTTP Referer 头 | 实现简单 | Referer 可能丢失 |

**本项目采用方案：Synchronizer Token + SameSite Cookie（双重防护）**

---

## 第三章：本次项目全功能 CSRF 审计

### 3.1 项目 POST 路由总览

```
Flask 路由                   方法    功能        需要登录    修复前 Token
──────────────────────────────────────────────────────────────────
/login                     GET+POST  登录      否          无
/register                  GET+POST  注册      否          无
/upload                    GET+POST  上传      是 @login_required  无
/recharge                  POST      充值      是 @login_required  无
/change-password           POST      改密      是 @login_required  无
/search                    GET       搜索      —          （GET，不需 CSRF）
/logout                    GET       退出      —          （GET，不需 CSRF）
/page                      GET       页面      —          （GET，不需 CSRF）
/profile                  GET       个人中心   —          （GET，不需 CSRF）
/                          GET       首页      —          （GET，不需 CSRF）
```

### 3.2 修复前的 CSRF 风险矩阵

| 路由 | CSRF Token | SameSite | 风险等级 | 攻击后果 |
|------|:---------:|:--------:|:-------:|---------|
| `POST /login` | 无 | None | 中危 | 跨站登录攻击 |
| `POST /register` | 无 | None | 中危 | 跨站创建账号 |
| `POST /upload` | 有（已修复） | Lax | 低危 | 跨站上传文件 |
| `POST /recharge` | **无** | Lax | **高危** | **跨站充值/扣款** |
| `POST /change-password` | **无** | Lax | **高危** | **跨站修改密码** |

### 3.3 修复后的 CSRF 防护状态

| 路由 | CSRF Token | SameSite | Token 一次性 | 防重放 |
|------|:---------:|:--------:|:----------:|:-----:|
| `POST /login` | 有 | Lax | 登录后刷新 | 有 |
| `POST /register` | 有 | Lax | 注册后刷新 | 有 |
| `POST /upload` | 有 | Lax | 上传后刷新 | 有 |
| `POST /recharge` | 有 | Lax | 充值后刷新 | 有 |
| `POST /change-password` | 有 | Lax | 改密后刷新 | 有 |

---

## 第四章：漏洞一 -- 登录接口 CSRF 缺失

### 4.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | CSRF - 跨站请求伪造 |
| 危害等级 | 中危 (Medium) |
| CWE 编号 | CWE-352: Cross-Site Request Forgery |
| 影响路由 | `POST /login` |
| 发现阶段 | 第一轮基础功能审计 |

### 4.2 漏洞分析（修复前）

**问题代码（`templates/login.html`，修复前）：**

```html
<form method="post" action="/login">
    <!-- 没有 CSRF Token 隐藏字段 -->
    <input type="text" name="username">
    <input type="password" name="password">
    <button>登录</button>
</form>
```

**问题代码（`app.py`，修复前）：**

```python
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        # 没有 CSRF 校验
        ...
```

### 4.3 攻击场景

```
攻击者构造恶意页面：
<html>
<body>
  <h1>点击抽奖！100% 中奖！</h1>
  <form action="http://192.168.14.129:5000/login" method="POST"
        style="display:none">
    <input name="username" value="attacker">
    <input name="password" value="hacked123">
  </form>
  <script>document.forms[0].submit()</script>
</body>
</html>

当受害者访问该页面时：
→ 浏览器自动提交 POST /login（附带用户之前的 Cookie）
→ 服务端验证通过（因为之前用户 A 登录过，Session 还在）
→ 攻击者获得 Session（可通过登录后的页面获取）
```

### 4.4 修复方案

```python
# app.py
def generate_csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)
    return session["csrf_token"]

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if not validate_csrf():
            abort(403, "CSRF 验证失败")
        ...

    return render_template("login.html", csrf_token=generate_csrf_token())
```

```html
<!-- templates/login.html -->
<form method="post" action="/login">
    <input type="hidden" name="csrf_token" value="{{ csrf_token }}">
    ...
</form>
```

---

## 第五章：漏洞二 -- 注册接口 CSRF 缺失

### 5.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | CSRF - 跨站请求伪造 |
| 危害等级 | 中危 (Medium) |
| 影响路由 | `POST /register` |

### 5.2 漏洞分析（修复前）

**同登录接口类似，注册表单缺少 `csrf_token` 隐藏字段，服务端未做 CSRF 校验。**

### 5.3 攻击场景

```
攻击者构造恶意页面：
<html>
<body>
  <form action="http://192.168.14.129:5000/register" method="POST"
        style="display:none">
    <input name="username" value="evil_user">
    <input name="password" value="evil_pass">
  </form>
  <script>document.forms[0].submit()</script>
</body>
</html>

当已登录用户访问该页面时：
→ 浏览器自动提交注册表单（附带 Session Cookie）
→ 攻击者的账号 "evil_user" 被创建
```

### 5.4 修复方案

**同登录接口，添加 `csrf_token` 隐藏字段 + 服务端 `validate_csrf()` 校验。**

---

## 第六章：漏洞三 -- 上传接口 CSRF 缺失

### 6.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | CSRF - 跨站请求伪造 |
| 危害等级 | 中危 (Medium) |
| 影响路由 | `POST /upload` |
| 发现阶段 | 第三轮上传功能审计（当时已修复） |

### 6.2 攻击场景

```
攻击者构造恶意页面：
<html>
<body>
  <form action="http://192.168.14.129:5000/upload"
        method="POST" enctype="multipart/form-data"
        style="display:none">
    <input name="file" type="file">
  </form>
  <script>
    // 通过 JS 构造文件上传请求（需用户选择文件）
    // 或引导用户点击"上传"
  </script>
</body>
</html>

危害：如果已登录用户被诱导上传恶意文件
→ 攻击者可上传 WebShell 或恶意脚本
```

### 6.3 修复方案

**添加 CSRF Token + 魔数校验 + 扩展名白名单，即使在 CSRF 防御被绕过的情况下仍有后续防线。**

---

## 第七章：漏洞四 -- 充值接口 CSRF 缺失 * 核心漏洞

### 7.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | CSRF - 跨站请求伪造 |
| 危害等级 | **高危 (High)** |
| CWE 编号 | CWE-352: Cross-Site Request Forgery |
| 影响路由 | `POST /recharge` |
| 发现阶段 | 第四轮充值功能审计 |

### 7.2 漏洞代码分析（修复前）

```python
@app.route("/recharge", methods=["POST"])
@login_required
def recharge():
    # 修复前：没有 CSRF Token 校验
    user_id = request.form.get("user_id", "")
    amount = request.form.get("amount", "0")
    ...
    c.execute(...)
    conn.commit()
    return redirect(...)
```

**问题：** 充值接口直接接受 POST 请求并修改数据库中的余额，但完全没有 CSRF 保护。

### 7.3 攻击场景 -- 跨站充值

```
攻击者构造的恶意 HTML 页面：
<html>
<body>
  <h1>免费领取游戏皮肤！</h1>
  <form action="http://192.168.14.129:5000/recharge" method="POST"
        style="display:none">
    <input name="user_id" value="2">    ← 攻击者的用户 ID
    <input name="amount" value="10000"> ← 充值金额
  </form>
  <script>document.forms[0].submit()</script>
</body>
</html>

攻击流程：
1. 受害者访问攻击者的恶意页面
2. 浏览器自动提交 POST /recharge
3. 浏览器携带受害者的 Session Cookie
4. 服务端以为是受害者在操作，执行充值
5. "攻击者的账户"收到了 10000 元（受害者买单！）
```

### 7.4 结合负值充值的双重攻击

```
如果在修复前结合负值充值漏洞（amount 未校验正负）：

攻击者构造的请求：
  POST /recharge
  user_id=1              ← 受害者的 ID
  amount=-50000          ← 负值！从受害者账户扣钱

攻击结果：
  1. 攻击者诱导受害者访问恶意页面
  2. 受害者的余额被扣减 50000
  3. 攻击者通过其他方式获利

Severity = CSRF + Business Logic Bug = CRITICAL
```

### 7.5 修复方案

```python
@app.route("/recharge", methods=["POST"])
@login_required
def recharge():
    # 新增 CSRF 校验
    if not validate_csrf():
        abort(403, "CSRF 验证失败")

    user_id = request.form.get("user_id", "")
    ...
```

---

## 第八章：漏洞五 -- 修改密码接口 CSRF 缺失 * 本轮修复

### 8.1 漏洞信息

| 项目 | 内容 |
|------|------|
| 漏洞类型 | CSRF - 跨站请求伪造 |
| 危害等级 | **高危 (High)** |
| CWE 编号 | CWE-352: Cross-Site Request Forgery |
| 影响路由 | `POST /change-password` |
| 发现阶段 | 第六轮密码修改功能审计 |

### 8.2 漏洞代码分析（修复前）

```python
@app.route("/change-password", methods=["POST"])
@login_required
def change_password():
    # 修复前：没有 CSRF Token 校验
    username = request.form.get("username", "")
    new_password = request.form.get("new_password", "")
    ...
    c.execute("UPDATE users SET password = ? WHERE username = ?",
              (password_hash, username))
```

**问题的严重性：**

```
CSRF 缺失  +  IDOR 越权  =  任意用户密码可被跨站修改

修复前：
1. 无 CSRF Token → 攻击者可构造跨站请求
2. 无 IDOR 校验 → 可修改任何用户的密码
3. 无原密码校验 → 不需要知道旧密码

这意味着：
攻击者只需让管理员访问一个恶意页面，
管理员的密码就会被修改为攻击者指定的值！
```

### 8.3 攻击场景 -- 账号接管

```
攻击者构造恶意页面：
<html>
<body>
  <h1>您的账户存在异常，请验证</h1>
  <form action="http://192.168.14.129:5000/change-password"
        method="POST" style="display:none">
    <input name="username" value="admin">       ← 目标管理员
    <input name="new_password" value="hacked!"> ← 攻击者设置的密码
    <input name="confirm_password" value="hacked!">
  </form>
  <script>document.forms[0].submit()</script>
</body>
</html>

攻击结果：
  1. 管理员访问恶意页面
  2. admin 的密码被改为 "hacked!"
  3. 攻击者用新密码登录 → 完全控制管理员账号
  4. 攻击者可查看所有用户数据、修改设置等
```

### 8.4 修复方案

```python
@app.route("/change-password", methods=["POST"])
@login_required
def change_password():
    # CSRF 校验
    if not validate_csrf():
        abort(403, "CSRF 验证失败")

    # IDOR 校验（从 session 获取用户名，不与表单比较）
    session_username = session.get("username", "")
    username = request.form.get("username", "")
    if username != session_username:
        abort(403, "无权修改其他用户的密码")
    ...
```

```html
<!-- templates/profile.html -->
<form method="post" action="/change-password">
    <input type="hidden" name="csrf_token" value="{{ csrf_token }}">
    <input type="hidden" name="username" value="{{ user['username'] }}">
    <input type="password" name="new_password" placeholder="新密码" required>
    <input type="password" name="confirm_password" placeholder="确认密码" required>
    <button type="submit">修改密码</button>
</form>
```

---

## 第九章：CSRF 防护方案

### 9.1 Synchronizer Token Pattern 实现

本项目采用业界标准的 **Synchronizer Token Pattern（同步令牌模式）** 实现 CSRF 防护。

```
┌──────────────────────────────────────────────────────┐
│                CSRF Token 生命周期                       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  步骤1：用户 GET 表单页面                                │
│  ───────────────────────────                           │
│  服务端检查 session 中是否有 csrf_token                   │
│  如果没有，生成一个随机 Token：secrets.token_hex(16)      │
│  存入 session，并传入模板                                 │
│                                                       │
│  步骤2：页面渲染                                        │
│  ─────────────                                          │
│  <input type="hidden" name="csrf_token"                 │
│         value="a1b2c3d4e5f6g7h8">                     │
│                                                       │
│  步骤3：用户提交表单                                     │
│  ───────────────                                        │
│  浏览器发送：csrf_token=a1b2c3d4e5f6g7h8 + 其他表单数据  │
│                                                       │
│  步骤4：服务端验证                                       │
│  ───────────────                                        │
│  对比 form 中的 csrf_token == session 中的 csrf_token    │
│  匹配 → 合法请求，执行操作                                │
│  不匹配 → 403 Forbidden，拒绝请求                        │
│                                                       │
│  步骤5：操作成功后刷新 Token                              │
│  ─────────────────────────                              │
│  重新生成 csrf_token，旧的 Token 失效                    │
│  防止 Token 被窃取后的重放攻击                            │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 9.2 核心代码实现

```python
import secrets

def generate_csrf_token():
    """生成 CSRF Token（如果 session 中不存在）"""
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)
    return session["csrf_token"]

def validate_csrf():
    """验证 CSRF Token"""
    token = request.form.get("csrf_token", "")
    stored = session.get("csrf_token", "")
    if not token or token != stored:
        return False
    return True

def refresh_csrf():
    """刷新 CSRF Token（每次成功操作后调用，防重放）"""
    session["csrf_token"] = secrets.token_hex(16)

# 每个请求自动确保 CSRF Token 存在
@app.before_request
def ensure_csrf():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)
```

### 9.3 防重放机制

```
单纯的 CSRF Token 防护有一个弱点：
如果攻击者获取了用户的一个有效 Token，可在 Token 过期前反复使用。

修复方案：每次成功操作后刷新 Token（一次性 Token）
┌──────────────────────────────────────────────┐
│  用户 GET /profile → Token = "abc123"         │
│                                              │
│  用户  POST /recharge + Token="abc123"       │
│  → 校验通过 ✅                                 │
│  → 执行充值操作 ✅                              │
│  → 刷新 Token 为 "def456"                      │
│                                              │
│  攻击者重放 POST /recharge + Token="abc123"  │
│  → 校验失败 ❌ （Token 已被刷新，旧 Token 失效） │
└──────────────────────────────────────────────┘
```

### 9.4 SameSite Cookie 辅助防护

```python
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,      # 禁止 JS 读取
    SESSION_COOKIE_SAMESITE="Lax",     # 同站策略
    SESSION_COOKIE_SECURE=False,       # 内网 HTTP 环境
)
```

**SameSite=Lax 的防护效果：**

| 请求方式 | 跨站是否带 Cookie | 能否 CSRF |
|---------|:---------------:|:---------:|
| `<a href>` GET 链接 | 是（安全） | 否（GET 不修改数据） |
| `<form method="GET">` | 是（安全） | 否（GET 不修改数据） |
| `<form method="POST">` | **否** | **防护成功** |
| `fetch()` POST | **否** | **防护成功** |
| `<script>` / `<img>` GET | 是 | 否（GET 不修改数据） |

---

## 第十章：修复前后代码对比

### 10.1 Login 路由对比

| 对比项 | 修复前 | 修复后 |
|--------|--------|--------|
| 表单 Token | 无 | `{{ csrf_token }}` 隐藏字段 |
| 后端校验 | 无 | `validate_csrf()` |
| 成功刷新 | 无 | `refresh_csrf()` |

### 10.2 Register 路由对比

| 对比项 | 修复前 | 修复后 |
|--------|--------|--------|
| 表单 Token | 无 | `{{ csrf_token }}` 隐藏字段 |
| 后端校验 | 无 | `validate_csrf()` |
| 成功刷新 | 无 | `refresh_csrf()` |

### 10.3 Upload 路由对比

| 对比项 | 修复前 | 修复后 |
|--------|--------|--------|
| 表单 Token | 无 | `{{ csrf_token }}` 隐藏字段 |
| 后端校验 | 无 | `validate_csrf()` |
| 成功刷新 | 无 | `refresh_csrf()` |

### 10.4 Recharge 路由对比 * 关键修复

| 对比项 | 修复前 | 修复后 |
|--------|--------|--------|
| 表单 Token | 无 | `{{ csrf_token }}` 隐藏字段 |
| 后端校验 | **无** | **`validate_csrf()`** |
| 成功刷新 | **无** | **`refresh_csrf()`** |
| 结合 IDOR 防护 | **无** | 同时修复（比对 session 用户） |
| 结合金额校验 | **无** | 同时修复（正数 + 上限） |

### 10.5 Change-password 路由对比 * 本轮修复

| 对比项 | 修复前 | 修复后 |
|--------|--------|--------|
| 表单 Token | **无** | **`{{ csrf_token }}` 隐藏字段** |
| 后端校验 | **无** | **`validate_csrf()`** |
| 成功刷新 | **无** | **`refresh_csrf()`** |
| 结合 IDOR 防护 | **无** | 同时修复（session 用户名比对） |
| 结合密码强度 | **无** | 同时修复（长度 ≥ 6） |

### 10.6 全局状态变化

```python
# ===== 修复前：5 个 POST 接口中只有 0 个有 CSRF 防护 =====
login()     → 无 CSRF
register()  → 无 CSRF
upload()    → 无 CSRF
recharge()  → 无 CSRF
change_password() → 无 CSRF


# ===== 修复后：5 个 POST 接口全部有 CSRF 防护 =====
login()     → validate_csrf() + refresh_csrf()
register()  → validate_csrf() + refresh_csrf()
upload()    → validate_csrf() + refresh_csrf()
recharge()  → validate_csrf() + refresh_csrf()
change_password() → validate_csrf() + refresh_csrf()
```

---

## 第十一章：安全修复验证

### 11.1 验证测试用例表

| 编号 | 测试内容 | 测试方法 | 预期结果 | 实际结果 | 结论 |
|------|---------|---------|---------|---------|:----:|
| T1 | 登录正常提交 | 携带有效 CSRF Token | 302 登录成功 | 302 | 通过 |
| T2 | 登录无 Token | 移除 csrf_token 字段 | 403 拒绝 | 403 | 通过 |
| T3 | 注册正常提交 | 携带有效 CSRF Token | 302 注册成功 | 302 | 通过 |
| T4 | 注册无 Token | 移除 csrf_token 字段 | 403 拒绝 | 403 | 通过 |
| T5 | 上传正常提交 | 携带有效 CSRF Token | 处理上传 | 处理上传 | 通过 |
| T6 | 上传无 Token | 移除 csrf_token 字段 | 403 拒绝 | 403 | 通过 |
| T7 | 充值正常提交 | 携带有效 CSRF Token | 302 充值成功 | 302 | 通过 |
| T8 | **充值无 Token** | 移除 csrf_token 字段 | **403 拒绝** | **403** | **通过** |
| T9 | 改密正常提交 | 携带有效 CSRF Token | 302 改密成功 | 302 | 通过 |
| T10 | **改密无 Token** | 移除 csrf_token 字段 | **403 拒绝** | **403** | **通过** |
| T11 | 改密越权他人 | 修改 username 为他人 | 403 拒绝 | 403 | 通过 |
| T12 | Token 重放测试 | 成功操作后重复使用旧 Token | 403 拒绝 | 403 | 通过 |

### 11.2 curl 验证命令

```bash
#!/bin/bash
# CSRF 防护验证脚本

BASE="http://127.0.0.1:5000"
COOKIE="/tmp/csrf_test.txt"

echo "CSRF 防护验证"
echo "=============================="

# 1. 登录 + CSRF
echo ""
echo "1. 登录（正常）"
CSRF=$(curl -s -c "$COOKIE" "$BASE/login" | grep -oP 'csrf_token" value="\K[a-f0-9]+')
curl -s -X POST "$BASE/login" -b "$COOKIE" -c "$COOKIE" \
  -d "csrf_token=$CSRF&username=admin&password=admin123" -L -o /dev/null -w "  HTTP: %{http_code}\n"

# 2. 充值（无CSRF -- 应403）
echo ""
echo "2. 充值（无CSRF, 应403）"
curl -s -o /dev/null -w "  HTTP: %{http_code}\n" -X POST "$BASE/recharge" \
  -b "$COOKIE" -d "user_id=1&amount=100"

# 3. 改密（无CSRF -- 应403）
echo ""
echo "3. 改密（无CSRF, 应403）"
curl -s -o /dev/null -w "  HTTP: %{http_code}\n" -X POST "$BASE/change-password" \
  -b "$COOKIE" -d "username=admin&new_password=test123"

# 4. 改密（越权 -- 应403）
echo ""
echo "4. 改密（越权他人, 应403）"
P_CSRF=$(curl -s "$BASE/profile" -b "$COOKIE" | grep -oP 'csrf_token" value="\K[a-f0-9]+')
curl -s -o /dev/null -w "  HTTP: %{http_code}\n" -X POST "$BASE/change-password" \
  -b "$COOKIE" -d "csrf_token=$P_CSRF&username=alice&new_password=test123"

# 5. 充值（正常）
echo ""
echo "5. 充值（正常）"
curl -s -o /dev/null -w "  HTTP: %{http_code}\n" -X POST "$BASE/recharge" \
  -b "$COOKIE" -d "csrf_token=$P_CSRF&user_id=1&amount=50"

echo ""
echo "=============================="
```

### 11.3 验证结果

```
测试1: 登录（正常）           HTTP 302  ✅
测试2: 充值（无CSRF）         HTTP 403  ✅
测试3: 改密（无CSRF）         HTTP 403  ✅
测试4: 改密（越权他人）        HTTP 403  ✅
测试5: 充值（正常）           HTTP 302  ✅
```

---

## 第十二章：总结与反思

### 12.1 实验核心收获

通过本次 CSRF 漏洞的审计与修复实践，掌握了以下核心知识：

**1. CSRF 攻击的本质**

```
CSRF = 利用 Cookie 自动发送机制 + 无额外校验的 POST 接口
```

**2. CSRF 防护的三层体系**

```
第一层（核心）：CSRF Token（Synchronizer Token Pattern）
  每个表单嵌入随机 Token，服务端校验匹配

第二层（辅助）：SameSite Cookie
  Cookie 设置 SameSite=Lax，阻止跨站 POST 携带 Cookie

第三层（进阶）：一次性 Token（防重放）
  成功操作后刷新 Token，旧 Token 立即失效
```

**3. 本项目 CSRF 修复的关键数据**

```
修复的 POST 路由数：     5 个（login, register, upload, recharge, change-password）
新增 CSRF 校验代码行数： ~30 行
新增 SameSite 配置：     1 行
防重放机制：             5 个路由全部实现
测试用例数：             12 个，全部通过
```

### 12.2 CSRF 防护检查清单

```
[ ] 所有 POST/PUT/DELETE 接口是否有 CSRF Token 校验？
[ ] 所有表单是否包含 csrf_token 隐藏字段？
[ ] CSRF Token 是否足够随机（至少 128 位）？
[ ] CSRF Token 是否保存在服务端（Session）而非 Cookie 中？
[ ] 成功操作后是否刷新了 CSRF Token（防重放）？
[ ] Session Cookie 是否设置了 SameSite 属性？
[ ] GET 请求是否不会修改数据（幂等性）？
[ ] 是否存在不需要 CSRF 的接口（如公开 API）？
```

### 12.3 本项目全部漏洞修复总览

| 轮次 | 新增功能 | 发现漏洞 | 其中 CSRF 漏洞 | CSRF 修复情况 |
|:----:|---------|:-------:|:--------------:|:------------:|
| 第1轮 | 基础登录 | 7 | 1（login） | 已修复 |
| 第2轮 | 注册+搜索 | 2 | 1（register） | 已修复 |
| 第3轮 | 头像上传 | 7 | 1（upload） | 已修复 |
| 第4轮 | 个人中心+充值 | 8 | 1（recharge） | **已修复** |
| 第5轮 | 动态页面 | 5 | 0（无POST） | — |
| 第6轮 | 修改密码 | 5 | 1（change-password） | **本轮已修复** |
| **总计** | **6 个功能** | **34** | **5** | **全部修复** |

### 12.4 结束语

> **"Cookie 是浏览器对用户的承诺，但不是对他人意图的保证。"**

CSRF 漏洞之所以危险，在于它不需要攻击者破解密码、不需要找到代码漏洞、不需要复杂的 payload。它只需要一个简单的 HTML 表单，和用户无意间的一次点击。

防御它的方式也是 Web 安全中最成熟、最标准化的：**每个 POST 请求都必须有一个不可预测的 Token，而且这个 Token 只能使用一次。**

---

## 参考资料

1. OWASP - Cross-Site Request Forgery (CSRF)
   https://owasp.org/www-community/attacks/csrf

2. OWASP - CSRF Prevention Cheat Sheet
   https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

3. CWE-352: Cross-Site Request Forgery
   https://cwe.mitre.org/data/definitions/352.html

4. PortSwigger - CSRF
   https://portswigger.net/web-security/csrf

5. Mozilla MDN - SameSite Cookie
   https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite

6. Python secrets 模块文档
   https://docs.python.org/3/library/secrets.html

7. Flask Session Cookie 配置
   https://flask.palletsprojects.com/en/stable/config/#SESSION_COOKIE_HTTPONLY

8. OWASP Top 10 - A01:2021 Broken Access Control
   https://owasp.org/Top10/A01_2021-Broken_Access_Control/

---

> **报告人：** \_\_\_\_\_\_\_\_\_\_\_\_\_\_
> **指导教师：** \_\_\_\_\_\_\_\_\_\_\_\_\_\_
> **日期：** 2026年7月14日
> **项目地址：** `http://192.168.14.129:5000`
> **源码路径：** `/root/flask_user_app/`
> **报告版本：** v1.0

---

*本报告由 Markdown 编写，可转换为 PDF / HTML / Word 等多种格式。*
