# GitLab 运维备忘

## 允许 Webhook 请求本地网络

GitLab 默认禁止 Webhook 向私有 IP（`192.168.x.x`、`10.x.x.x` 等）发送请求。

### 方法 1：Admin UI

Admin Area → Settings → Network → Outbound requests → 勾选 "Allow requests to the local network from webhooks and integrations"

### 方法 2：Rails Console

```bash
sudo gitlab-rails console
# Docker: docker exec -it <容器名> gitlab-rails console
```

```ruby
ApplicationSetting.current.update_column(:allow_local_requests_from_web_hooks_and_services, true)
```

> 如果 `settings.save!` 报 `OpenSSL::Cipher::CipherError`，说明 `db_key_base` 加密密钥损坏，用 `update_column` 绕过验证直接写库。Admin 页面 500 错误通常也是同一原因。

## Docker 容器访问局域网其他机器

场景：GitLab 运行在 Mac mini Docker（bridge 模式），需要向 Windows 机器（192.168.50.43）发送 Webhook。

Docker bridge 模式下容器无法直接访问宿主机所在局域网的其他机器。解决方案是在宿主机上用 socat 做端口转发：

```bash
# Mac mini 上安装并启动转发
brew install socat
socat TCP-LISTEN:3001,fork TCP:192.168.50.43:3000 &
```

GitLab Webhook URL 填写：
```
http://host.docker.internal:3001/gitlab
```

链路：容器 → `host.docker.internal:3001`（Mac mini 宿主机）→ socat → `192.168.50.43:3000`（Windows）

## Windows 防火墙开放端口

```powershell
# 管理员 PowerShell
netsh advfirewall firewall add rule name="GitLab Webhook 3000" dir=in action=allow protocol=TCP localport=3000

# 删除规则
netsh advfirewall firewall delete rule name="GitLab Webhook 3000"
```
