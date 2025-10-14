import sys

# Read the file
with open(sys.argv[1], 'r') as f:
    lines = f.readlines()

# Fix line 29 (index 28)
if len(lines) > 28:
    lines[28] = lines[28].replace("ids.split(,`).map", "ids.split(',').map")

# Write back
with open(sys.argv[1], 'w') as f:
    f.writelines(lines)

print("Fixed line 29 in", sys.argv[1])