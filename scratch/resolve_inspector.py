import subprocess
import os

def list_unmerged_files():
    result = subprocess.run(["git", "diff", "--name-only", "--diff-filter=U"], capture_output=True, text=True)
    return [line.strip() for line in result.stdout.split('\n') if line.strip()]

def get_conflict_sections(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        conflicts = []
        in_conflict = False
        current_conflict = []
        for i, line in enumerate(lines):
            if line.startswith("<<<<<<< HEAD"):
                in_conflict = True
                current_conflict.append((i, line))
            elif line.startswith("======="):
                if in_conflict:
                    current_conflict.append((i, line))
            elif line.startswith(">>>>>>>"):
                if in_conflict:
                    current_conflict.append((i, line))
                    conflicts.append(current_conflict)
                    current_conflict = []
                    in_conflict = False
            else:
                if in_conflict:
                    current_conflict.append((i, line))
        
        return conflicts
    except Exception as e:
        return str(e)

files = list_unmerged_files()
print(f"Conflicted files: {len(files)}")
for f in files:
    conflicts = get_conflict_sections(f)
    print(f"\n--- {f} ---")
    if isinstance(conflicts, str):
        print(f"Error: {conflicts}")
    else:
        for c in conflicts:
            print(f"Conflict from line {c[0][0]+1} to {c[-1][0]+1}:")
            for line_info in c:
                print(line_info[1], end='')
