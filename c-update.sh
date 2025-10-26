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
API_BASE_URL="https://api.z.ai/api/anthropic"
API_KEY_URL="https://z.ai/manage-apikey/apikey-list"
API_TIMEOUT_MS=3000000

# Default API Keys
declare -A API_KEYS=(
    [1]="95f46d84a34a48b29001581cd8931236.x7CUYWYubskKYwvn"
    [2]="55cc29474ec341309f46c400dd2e27c1.3HWVT2Mm65IcZPN4"
    [3]="81a58b3d27eb433d91693f7607ffd288.O7eunCaYfBajIq0c"
)

declare -A API_KEY_DESCRIPTIONS=(
    [1]="rickicode@gmail.com (Google)"
    [2]="rickicode (GitHub)"
    [3]="rickiuchiha@gmail.com"
)

# ========================
#       工具函数
# ========================

log_info() {
    echo "🔹 $*"
}

log_success() {
    echo "✅ $*"
}

log_error() {
    echo "❌ $*" >&2
}

ensure_dir_exists() {
    local dir="$1"
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir" || {
            log_error "Failed to create directory: $dir"
            exit 1
        }
    fi
}

# ========================
#     Node.js 安装函数
# ========================

install_nodejs() {
    local platform=$(uname -s)

    case "$platform" in
        Linux|Darwin)
            log_info "Installing Node.js on $platform..."

            # 安装 nvm
            log_info "Installing nvm ($NVM_VERSION)..."
            curl -s https://raw.githubusercontent.com/nvm-sh/nvm/"$NVM_VERSION"/install.sh | bash

            # 加载 nvm
            log_info "Loading nvm environment..."
            \. "$HOME/.nvm/nvm.sh"

            # 安装 Node.js
            log_info "Installing Node.js $NODE_INSTALL_VERSION..."
            nvm install "$NODE_INSTALL_VERSION"

            # 验证安装
            node -v &>/dev/null || {
                log_error "Node.js installation failed"
                exit 1
            }
            log_success "Node.js installed: $(node -v)"
            log_success "npm version: $(npm -v)"
            ;;
        *)
            log_error "Unsupported platform: $platform"
            exit 1
            ;;
    esac
}

# ========================
#     Node.js 检查函数
# ========================

check_nodejs() {
    if command -v node &>/dev/null; then
        current_version=$(node -v | sed 's/v//')
        major_version=$(echo "$current_version" | cut -d. -f1)

        if [ "$major_version" -ge "$NODE_MIN_VERSION" ]; then
            log_success "Node.js is already installed: v$current_version"
            return 0
        else
            log_info "Node.js v$current_version is installed but version < $NODE_MIN_VERSION. Upgrading..."
            install_nodejs
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
    if command -v claude &>/dev/null; then
        log_success "Claude Code is already installed: $(claude --version)"
    else
        log_info "Installing Claude Code..."
        npm install -g "$CLAUDE_PACKAGE" || {
            log_error "Failed to install claude-code"
            exit 1
        }
        log_success "Claude Code installed successfully"
    fi
}

configure_claude_json(){
  node --eval '
      const os = require("os");
      const fs = require("fs");
      const path = require("path");

      const homeDir = os.homedir();
      const filePath = path.join(homeDir, ".claude.json");
      if (fs.existsSync(filePath)) {
          const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          fs.writeFileSync(filePath, JSON.stringify({ ...content, hasCompletedOnboarding: true }, null, 2), "utf-8");
      } else {
          fs.writeFileSync(filePath, JSON.stringify({ hasCompletedOnboarding: true }, null, 2), "utf-8");
      }'
}

# ========================
#     API Key 配置
# ========================

get_current_api_key() {
    if [ -f "$CONFIG_FILE" ]; then
        node --eval '
            const fs = require("fs");
            const path = require("path");
            const homeDir = require("os").homedir();
            const filePath = path.join(homeDir, ".claude", "settings.json");
            
            if (fs.existsSync(filePath)) {
                try {
                    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                    if (content.env && content.env.ANTHROPIC_AUTH_TOKEN) {
                        console.log(content.env.ANTHROPIC_AUTH_TOKEN);
                    }
                } catch (e) {}
            }
        ' 2>/dev/null || echo ""
    else
        echo ""
    fi
}

configure_claude() {
    log_info "Configuring Claude Code..."
    
    # Deteksi API key yang sedang digunakan
    current_api_key=$(get_current_api_key)
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "   📋 Available API Keys:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Tampilkan setiap API key dengan indikator jika sedang digunakan
    for i in 1 2 3; do
        if [ -n "$current_api_key" ] && [ "${API_KEYS[$i]}" = "$current_api_key" ]; then
            echo "   [${i}] ${API_KEY_DESCRIPTIONS[$i]} ✓ (Currently Active)"
        else
            echo "   [${i}] ${API_KEY_DESCRIPTIONS[$i]}"
        fi
    done
    
    # Cek jika API key saat ini bukan dari default list
    if [ -n "$current_api_key" ]; then
        is_default=false
        for i in 1 2 3; do
            if [ "${API_KEYS[$i]}" = "$current_api_key" ]; then
                is_default=true
                break
            fi
        done
        
        if [ "$is_default" = false ]; then
            echo "   [m] Manual input (custom API key) ✓ (Currently Active)"
        else
            echo "   [m] Manual input (custom API key)"
        fi
    else
        echo "   [m] Manual input (custom API key)"
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    read -p "🔑 Choose your API key (1/2/3/m): " choice
    
    case "$choice" in
        1|2|3)
            api_key="${API_KEYS[$choice]}"
            log_success "Selected: ${API_KEY_DESCRIPTIONS[$choice]}"
            ;;
        m|M)
            echo ""
            echo "   You can get your API key from: $API_KEY_URL"
            read -s -p "🔑 Please enter your ZHIPU API key: " api_key
            echo
            ;;
        *)
            log_error "Invalid choice. Please run the script again and select 1, 2, 3, or m."
            exit 1
            ;;
    esac

    if [ -z "$api_key" ]; then
        log_error "API key cannot be empty. Please run the script again."
        exit 1
    fi

    ensure_dir_exists "$CONFIG_DIR"

    # 写入配置文件
    node --eval '
        const os = require("os");
        const fs = require("fs");
        const path = require("path");

        const homeDir = os.homedir();
        const filePath = path.join(homeDir, ".claude", "settings.json");
        const apiKey = "'"$api_key"'";

        const content = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
            : {};

        fs.writeFileSync(filePath, JSON.stringify({
            ...content,
            env: {
                ANTHROPIC_AUTH_TOKEN: apiKey,
                ANTHROPIC_BASE_URL: "'"$API_BASE_URL"'",
                API_TIMEOUT_MS: "'"$API_TIMEOUT_MS"'",
            }
        }, null, 2), "utf-8");
    ' || {
        log_error "Failed to write settings.json"
        exit 1
    }

    log_success "Claude Code configured successfully"
}

# ========================
#        主流程
# ========================

main() {
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