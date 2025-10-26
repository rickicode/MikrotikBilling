#!/bin/bash
set -euo pipefail

# ========================
#       常量定义
# ========================
SCRIPT_NAME=$(basename "$0")
NODE_MIN_VERSION=18
NODE_INSTALL_VERSION=22
NVM_VERSION="v0.40.3"
CLAUDE_PACKAGE="@anthropic-ai/claude-code"
CONFIG_DIR="$HOME/.claude"
CONFIG_FILE="$CONFIG_DIR/settings.json"
API_BASE_URL="https://api.z.ai/v1"
API_KEY_URL="https://z.ai/manage-apikey/apikey-list"
API_TIMEOUT_MS=3000000
CHECK_ENDPOINT="https://api.z.ai/api/coding/paas/v4/chat/completions"

# Default API Keys
declare -A API_KEYS=(
    [1]="95f46d84a34a48b29001581cd8931236.x7CUYWYubskKYwvn"
    [2]="55cc29474ec341309f46c400dd2e27c1.3HWVT2Mm65IcZPN4"
    [3]="81a58b3d27eb433d91693f7607ffd288.O7eunCaYfBajIq0c"
)

declare -A API_KEY_DESCRIPTIONS=(
    [1]="rickicode@gmail.com (Google)"
    [2]="rickicode (GitHub)"
    [3]="rickiuchiha@gmail.com (Google)"
)

# ========================
#       工具函数
# ========================
log_info()    { echo "🔹 $*"; }
log_success() { echo "✅ $*"; }
log_error()   { echo "❌ $*" >&2; }

ensure_dir_exists() {
    local dir="$1"
    [ -d "$dir" ] || mkdir -p "$dir" || { log_error "Failed to create dir: $dir"; exit 1; }
}

# ========================
#     Node.js 安装函数
# ========================
install_nodejs() {
    local platform
    platform=$(uname -s)
    case "$platform" in
        Linux|Darwin)
            log_info "Installing Node.js..."
            curl -s https://raw.githubusercontent.com/nvm-sh/nvm/"$NVM_VERSION"/install.sh | bash
            # shellcheck source=/dev/null
            \. "$HOME/.nvm/nvm.sh"
            nvm install "$NODE_INSTALL_VERSION"
            node -v >/dev/null || { log_error "Node.js install failed"; exit 1; }
            log_success "Node.js $(node -v) installed."
            ;;
        *) log_error "Unsupported platform: $platform"; exit 1 ;;
    esac
}

check_nodejs() {
    if command -v node >/dev/null; then
        local v major
        v=$(node -v | sed 's/v//')
        major=${v%%.*}
        if [ "$major" -lt "$NODE_MIN_VERSION" ]; then
            log_info "Node.js version < $NODE_MIN_VERSION. Upgrading..."
            install_nodejs
        else
            log_success "Node.js version OK: v$v"
        fi
    else
        log_info "Node.js not found. Installing..."
        install_nodejs
    fi
}

# ========================
#     Claude Code 安装
# ========================
install_claude_code() {
    if command -v claude >/dev/null; then
        log_success "Claude Code already installed: $(claude --version)"
    else
        log_info "Installing Claude Code..."
        npm install -g "$CLAUDE_PACKAGE" || { log_error "Failed install claude-code"; exit 1; }
        log_success "Claude Code installed."
    fi
}

configure_claude_json(){
  node --eval '
      const fs=require("fs"),os=require("os"),p=require("path");
      const file=p.join(os.homedir(),".claude.json");
      const obj=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):{};
      obj.hasCompletedOnboarding=true;
      fs.writeFileSync(file,JSON.stringify(obj,null,2));
  '
}

# ========================
#     API Key 配置
# ========================
get_current_api_key() {
    if [ -f "$CONFIG_FILE" ]; then
        node --eval '
            const fs=require("fs"),p=require("path"),os=require("os");
            const f=p.join(os.homedir(),".claude","settings.json");
            if(fs.existsSync(f)){
                try{
                    const j=JSON.parse(fs.readFileSync(f,"utf8"));
                    if(j.env&&j.env.ANTHROPIC_AUTH_TOKEN)console.log(j.env.ANTHROPIC_AUTH_TOKEN);
                }catch{}
            }'
    fi
}

configure_claude() {
    log_info "Configuring Claude Code..."
    local current_api_key choice api_key
    current_api_key=$(get_current_api_key)
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "   📋 Available API Keys:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    for i in 1 2 3; do
        if [ "${API_KEYS[$i]}" = "$current_api_key" ]; then
            echo "   [$i] ${API_KEY_DESCRIPTIONS[$i]} ✓ (Active)"
        else
            echo "   [$i] ${API_KEY_DESCRIPTIONS[$i]}"
        fi
    done
    echo "   [m] Manual input (custom API key)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    read -p "🔑 Choose your API key (1/2/3/m): " choice
    case "$choice" in
        1|2|3) api_key="${API_KEYS[$choice]}" ;;
        m|M)
            echo "Get your API key at: $API_KEY_URL"
            read -s -p "🔑 Enter your ZHIPU API key: " api_key; echo ;;
        *) log_error "Invalid choice"; exit 1 ;;
    esac
    [ -z "$api_key" ] && { log_error "API key cannot be empty"; exit 1; }
    ensure_dir_exists "$CONFIG_DIR"
    node --eval '
        const fs=require("fs"),os=require("os"),p=require("path");
        const file=p.join(os.homedir(),".claude","settings.json");
        const key="'"$api_key"'";
        const base="'"$API_BASE_URL"'";
        const timeout="'"$API_TIMEOUT_MS"'";
        const j=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):{};
        j.env={ANTHROPIC_AUTH_TOKEN:key,ANTHROPIC_BASE_URL:base,API_TIMEOUT_MS:timeout};
        fs.writeFileSync(file,JSON.stringify(j,null,2));
    '
    log_success "Claude configured successfully."
}

# ========================
#     API Check Function
# ========================
check_api_status() {
    check_nodejs
    echo ""
    echo "🔍 Checking Z.AI (GLM-4.5-air) API availability..."
    node --input-type=module --eval "
import fetch from 'node-fetch';

const endpoint = '$CHECK_ENDPOINT';
const apis = [
  { name: '${API_KEY_DESCRIPTIONS[1]}', key: '${API_KEYS[1]}' },
  { name: '${API_KEY_DESCRIPTIONS[2]}', key: '${API_KEYS[2]}' },
  { name: '${API_KEY_DESCRIPTIONS[3]}', key: '${API_KEYS[3]}' },
];

for (const api of apis) {
  const start = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + api.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'GLM-4.5-air',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8
      }),
    });

    const ms = Date.now() - start;
    const text = await res.text();

    if (res.status === 200) {
      console.log('✅ ' + api.name + ' → OK (GLM-4.5-air, ' + ms + ' ms)');
    } else if (res.status === 429) {
      let msg = '';
      try {
        const data = JSON.parse(text);
        msg = data?.error?.message || 'Rate limit reached';
      } catch {
        msg = text || 'Rate limit reached';
      }
      console.log('⏳ ' + api.name + ' → ' + msg);
    } else if (res.status === 401) {
      console.log('🚫 ' + api.name + ' → Unauthorized (401)');
    } else if (res.status === 403) {
      console.log('❌ ' + api.name + ' → Forbidden (403)');
    } else {
      console.log('⚠️  ' + api.name + ' → ' + res.status + ' → ' + text.slice(0,80));
    }

  } catch (e) {
    console.log('❌ ' + api.name + ' → Error: ' + e.message);
  }
}
"
}


# ========================
#        主流程
# ========================
main() {
    if [[ "${1:-}" == "--check" ]]; then
        check_api_status
        exit 0
    fi

    echo "🚀 Starting $SCRIPT_NAME"
    check_nodejs
    install_claude_code
    configure_claude_json
    configure_claude
    echo ""
    log_success "🎉 Installation completed successfully!"
    echo ""
    echo "🚀 You can now start using Claude Code with:"
    echo "   claude"
}

main "$@"
