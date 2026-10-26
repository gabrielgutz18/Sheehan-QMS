#!/usr/bin/env bash
# makes the HTTPS certificate nginx serves the app with (deploy/nginx-https.conf), signed by the shop's own
# certificate authority: free, since no public authority issues certificates for a .local name, and every device
# trusts it once that authority's certificate (http://<server>/sheehan-ca.crt) is installed on it
# first time: sudo bash deploy/make-certs.sh                                    (sheehanqms.local and this server's IPs)
#             sudo bash deploy/make-certs.sh sheehanqms.local 192.168.1.208     (names and IPs of your own)
# run it again before the certificate runs out (it says when, about 2 years): it keeps the authority, so the devices
# don't need anything installed again
set -euo pipefail

DIR=/etc/ssl/sheehan-queue
# the authority lasts 10 years; Apple devices refuse a server certificate that lasts longer than 825 days
CA_DAYS=3650
CERT_DAYS=825

main() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "Run it with sudo: sudo bash $0 $*" >&2
        return 1
    fi

    # the names and addresses the app is opened by; the first one is the certificate's name
    local names=("$@")
    if [ ${#names[@]} -eq 0 ]; then
        names=("$(hostname -s).local")
        local ip
        for ip in $(hostname -I); do
            [[ $ip =~ ^[0-9.]+$ ]] && names+=("$ip")
        done
    fi
    local san="" name
    for name in "${names[@]}"; do
        if [[ $name =~ ^[0-9.]+$ ]]; then san+="IP:$name,"; else san+="DNS:$name,"; fi
    done
    san="${san%,}"

    local tmp
    tmp="$(mktemp -d)"
    # expanded now: tmp is gone by the time the script exits
    trap "rm -rf '$tmp'" EXIT
    mkdir -p "$DIR"
    chmod 755 "$DIR"

    if [ ! -f "$DIR/ca.key" ]; then
        echo "==> Making the shop's certificate authority (only the first time)"
        cat > "$tmp/ca.cnf" <<'EOF'
[req]
distinguished_name = dn
prompt = no
x509_extensions = ca_ext
[dn]
O = Sheehan
CN = Sheehan QMS local certificate authority
[ca_ext]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
EOF
        openssl req -x509 -new -nodes -newkey rsa:4096 -sha256 -days "$CA_DAYS" -config "$tmp/ca.cnf" \
            -keyout "$tmp/ca.key" -out "$tmp/ca.crt"
        install -m 600 "$tmp/ca.key" "$DIR/ca.key"
        # public: nginx hands it out at /sheehan-ca.crt for the devices to install
        install -m 644 "$tmp/ca.crt" "$DIR/ca.crt"
    else
        echo "==> Keeping the certificate authority already in $DIR"
    fi

    echo "==> Making the server's certificate for ${names[*]}"
    cat > "$tmp/server.ext" <<EOF
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = $san
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid, issuer
EOF
    openssl req -new -nodes -newkey rsa:2048 -subj "/CN=${names[0]}" -keyout "$tmp/server.key" -out "$tmp/server.csr"
    openssl x509 -req -in "$tmp/server.csr" -CA "$DIR/ca.crt" -CAkey "$DIR/ca.key" \
        -set_serial "0x$(openssl rand -hex 16)" -days "$CERT_DAYS" -sha256 -extfile "$tmp/server.ext" \
        -out "$tmp/server.crt"
    install -m 600 "$tmp/server.key" "$DIR/server.key"
    install -m 644 "$tmp/server.crt" "$DIR/server.crt"

    # so a renewed certificate is served straight away
    if systemctl is-active --quiet nginx && nginx -t 2>/dev/null; then
        systemctl reload nginx
        echo "==> Reloaded nginx"
    fi

    echo "==> Done: https://${names[0]}/ $(openssl x509 -in "$DIR/server.crt" -noout -enddate | sed 's/notAfter=\(.*\)/(runs out \1)/')"
    echo "    Install the certificate authority on each device once: http://${names[0]}/sheehan-ca.crt"
}

main "$@"
