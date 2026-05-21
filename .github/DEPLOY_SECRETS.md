# Secrets e setup de deploy — Backend

Pipeline: push na `main` → build da imagem no GitHub Actions → push para o
GHCR → deploy via SSH no VPS (`docker compose -f docker-compose.prod.yml`).

---

## 1. GitHub Secrets

Configure em **Settings → Secrets and variables → Actions → New repository secret**.

| Secret             | Descrição                                                                 | Exemplo                          |
|--------------------|---------------------------------------------------------------------------|----------------------------------|
| `SSH_HOST`         | IP ou domínio do VPS                                                       | `203.0.113.10`                   |
| `SSH_USER`         | Usuário SSH no VPS                                                         | `deploy`                         |
| `SSH_PORT`         | Porta SSH                                                                  | `22`                             |
| `SSH_PRIVATE_KEY`  | Chave **privada** SSH (conteúdo completo, com cabeçalho/rodapé)            | `-----BEGIN OPENSSH PRIVATE KEY-----\n...` |
| `DEPLOY_PATH`      | Pasta no VPS onde fica o compose + `.env`                                  | `/opt/guardaapp/backend`         |
| `GHCR_TOKEN`       | Personal Access Token (classic) com escopo `read:packages` — usado pelo VPS para baixar a imagem do GHCR | `ghp_xxx`                        |

> `GITHUB_TOKEN` (login no GHCR durante o build) é fornecido automaticamente
> pelo Actions — você **não** precisa criá-lo.

### Gerar o par de chaves SSH

```bash
ssh-keygen -t ed25519 -C "github-actions-backend" -f ./deploy_key
# Chave PÚBLICA (deploy_key.pub) → adicionar ao VPS:
ssh-copy-id -i ./deploy_key.pub deploy@SEU_VPS
# Chave PRIVADA (deploy_key) → colar no secret SSH_PRIVATE_KEY
```

### Gerar o GHCR_TOKEN

GitHub → Settings (perfil) → Developer settings → Personal access tokens →
Tokens (classic) → escopo `read:packages`. Cole o valor no secret `GHCR_TOKEN`.

---

## 2. Setup do VPS (uma vez)

```bash
# Como root ou sudo:
apt-get update && apt-get install -y docker.io docker-compose-plugin
systemctl enable --now docker

# Usuário de deploy + acesso ao docker
adduser --disabled-password deploy
usermod -aG docker deploy

# Pasta do deploy (precisa bater com DEPLOY_PATH)
mkdir -p /opt/guardaapp/backend
chown deploy:deploy /opt/guardaapp/backend
```

### `.env` de produção (no VPS, em `DEPLOY_PATH`)

O `.env` **não** vai pelo git nem pelo pipeline — fica só no servidor.
Copie a partir de `.env.example` e preencha com valores reais
(banco, JWT, MinIO, SMTP real). Pontos de atenção para produção:

- `NODE_ENV=production`
- `DB_HOST=mysql` e `MINIO_ENDPOINT=minio` (nomes dos serviços do compose)
- `MINIO_PUBLIC_ENDPOINT` = domínio/IP público do MinIO (para presigned URLs)
- `SMTP_*` apontando para um provedor real (o MailHog é só dev)
- `WS_CORS_ORIGIN` = domínio do frontend (evite `*` em produção)
- Segredos fortes em `JWT_SECRET`, `JWT_REFRESH_SECRET`, `AUDIT_CHAIN_SECRET`

```bash
cd /opt/guardaapp/backend
cp .env.example .env   # depois edite com os valores reais
# As migrations precisam estar acessíveis ao MySQL no primeiro boot:
# o pipeline também envia ./migrations? NÃO — copie-as uma vez ou
# rode `npm run migrate` (o pipeline já faz isso a cada deploy).
```

> Observação: o `docker-compose.prod.yml` monta `./migrations` no MySQL para o
> seed inicial. Se preferir depender só do `npm run migrate` (já rodado pelo
> pipeline), pode remover esse volume.
