#!/usr/bin/env bash
# Instala o actualiza DentFinance en un VPS Ubuntu/Debian: MySQL + Gunicorn + Nginx (+ HTTPS).
#
#   sudo bash deploy/instalar_vps.sh midominio.com [correo-para-ssl]
#
# Se ejecuta desde la carpeta del proyecto (git clone). Se puede volver a correr para
# actualizar (git pull + migraciones): no borra la base de datos ni el .env.
set -euo pipefail

DOMINIO="${1:?Uso: sudo bash deploy/instalar_vps.sh midominio.com [correo-ssl]}"
CORREO_SSL="${2:-}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="${SUDO_USER:-$(whoami)}"
SERVICIO=dentfinance
DB_NAME=dentfinance
DB_USER=dentfinance

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta con sudo"; exit 1; }
echo "==> Proyecto: $APP_DIR (usuario $APP_USER, dominio $DOMINIO)"

echo "==> Paquetes del sistema"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  python3 python3-venv python3-dev build-essential pkg-config default-libmysqlclient-dev \
  mysql-server nginx certbot python3-certbot-nginx >/dev/null
systemctl enable --now mysql >/dev/null

echo "==> Archivo .env"
ENV_FILE="$APP_DIR/.env"
if ! grep -q '^DB_NAME=.\+' "$ENV_FILE" 2>/dev/null; then
  [ -f "$ENV_FILE" ] && cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"
  DB_PASS="$(openssl rand -hex 24)"
  cat > "$ENV_FILE" <<EOF
DJANGO_SECRET_KEY=$(openssl rand -base64 48 | tr -d '\n=+/')
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=$DOMINIO,www.$DOMINIO,$(hostname -I | awk '{print $1}')
DJANGO_HTTPS=0
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS
DB_HOST=127.0.0.1
DB_PORT=3306
EOF
  chown "$APP_USER": "$ENV_FILE"; chmod 600 "$ENV_FILE"
  echo "    .env creado (si tenías uno, quedó respaldado como .env.bak.*)"
fi
DB_PASS="$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"

echo "==> Base de datos MySQL"
mysql <<EOF
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOF

echo "==> Entorno Python, migraciones y estáticos"
sudo -u "$APP_USER" bash -c "
  cd '$APP_DIR'
  [ -d .venv ] || python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
  .venv/bin/python manage.py migrate --no-input
  .venv/bin/python manage.py collectstatic --no-input -v0
  mkdir -p media
"

echo "==> Servicio systemd (Gunicorn)"
cat > /etc/systemd/system/$SERVICIO.service <<EOF
[Unit]
Description=DentFinance (Gunicorn)
After=network.target mysql.service

[Service]
User=$APP_USER
Group=www-data
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/.venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 60
Restart=always

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable $SERVICIO >/dev/null
systemctl restart $SERVICIO

echo "==> Nginx"
cat > /etc/nginx/sites-available/$SERVICIO <<EOF
server {
    listen 80;
    server_name $DOMINIO www.$DOMINIO _;
    client_max_body_size 12M;

    location /static/ {
        alias $APP_DIR/staticfiles/;
        expires 30d;
    }
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/$SERVICIO /etc/nginx/sites-enabled/$SERVICIO
rm -f /etc/nginx/sites-enabled/default
# Nginx necesita poder entrar a la carpeta del proyecto para servir /static/
chmod o+x "$APP_DIR" "$(dirname "$APP_DIR")" 2>/dev/null || true
nginx -t -q && systemctl reload nginx

if [ -n "$CORREO_SSL" ]; then
  echo "==> Certificado HTTPS (Let's Encrypt)"
  if certbot --nginx -n --agree-tos -m "$CORREO_SSL" -d "$DOMINIO" -d "www.$DOMINIO" --redirect; then
    sed -i 's/^DJANGO_HTTPS=0/DJANGO_HTTPS=1/' "$ENV_FILE"
    systemctl restart $SERVICIO
  else
    echo "    No se pudo emitir el certificado (¿el dominio ya apunta a este VPS?). Sigue en HTTP."
  fi
fi

sleep 2
echo "==> Salud: $(curl -s http://127.0.0.1:8000/healthz -H "Host: $DOMINIO" || echo 'sin respuesta')"
echo "Listo. Logs: journalctl -u $SERVICIO -f"
