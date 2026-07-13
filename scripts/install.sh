#!/bin/sh

set -eu

usage() {
  echo "usage: $0 (--user | --project PATH) [--with-espanso] [--force]" >&2
  exit 2
}

mode=""
project_path=""
force="false"
with_espanso="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --user)
      [ -z "$mode" ] || usage
      mode="user"
      shift
      ;;
    --project)
      [ -z "$mode" ] || usage
      [ "$#" -ge 2 ] || usage
      mode="project"
      project_path="$2"
      shift 2
      ;;
    --force)
      force="true"
      shift
      ;;
    --with-espanso)
      with_espanso="true"
      shift
      ;;
    *)
      usage
      ;;
  esac
done

[ -n "$mode" ] || usage

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)

if [ "$mode" = "user" ]; then
  destination="${HOME}/.claude"
else
  [ -d "$project_path" ] || {
    echo "project path does not exist: $project_path" >&2
    exit 1
  }
  destination=$(CDPATH= cd -- "$project_path" && pwd)/.claude
fi

check_tree() {
  source_tree="$1"
  destination_tree="$2"

  find "$source_tree" -type f | while IFS= read -r source_file; do
    relative_path=${source_file#"$source_tree"/}
    destination_file="$destination_tree/$relative_path"

    if [ -e "$destination_file" ] && ! cmp -s "$source_file" "$destination_file"; then
      if [ "$force" != "true" ]; then
        echo "refusing to overwrite: $destination_file (use --force)" >&2
        exit 1
      fi
    fi
  done
}

copy_tree() {
  source_tree="$1"
  destination_tree="$2"

  find "$source_tree" -type f | while IFS= read -r source_file; do
    relative_path=${source_file#"$source_tree"/}
    destination_file="$destination_tree/$relative_path"

    mkdir -p "$(dirname -- "$destination_file")"
    cp "$source_file" "$destination_file"
    echo "installed $destination_file"
  done
}

check_file() {
  source_file="$1"
  destination_file="$2"
  if [ -e "$destination_file" ] && ! cmp -s "$source_file" "$destination_file"; then
    if [ "$force" != "true" ]; then
      echo "refusing to overwrite: $destination_file (use --force)" >&2
      exit 1
    fi
  fi
}

copy_file() {
  source_file="$1"
  destination_file="$2"
  mkdir -p "$(dirname -- "$destination_file")"
  cp "$source_file" "$destination_file"
  echo "installed $destination_file"
}

if [ "$with_espanso" = "true" ]; then
  case "$(uname -s)" in
    Darwin)
      espanso_destination="$HOME/Library/Application Support/espanso/match/maestro-mini.yml"
      ;;
    Linux)
      espanso_destination="${XDG_CONFIG_HOME:-$HOME/.config}/espanso/match/maestro-mini.yml"
      ;;
    *)
      echo "use scripts/install.ps1 for Espanso installation on Windows" >&2
      exit 1
      ;;
  esac
  espanso_source="$repo_root/text-replacements/espanso/maestro-mini.yml"
fi

check_tree "$repo_root/.claude/agents" "$destination/agents"
check_tree "$repo_root/.claude/skills" "$destination/skills"
[ "$with_espanso" != "true" ] || check_file "$espanso_source" "$espanso_destination"
copy_tree "$repo_root/.claude/agents" "$destination/agents"
copy_tree "$repo_root/.claude/skills" "$destination/skills"
[ "$with_espanso" != "true" ] || copy_file "$espanso_source" "$espanso_destination"
