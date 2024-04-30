import io
import os
import struct
import subprocess
import sys
import tempfile


def get_dict(fp):
    magic = fp.read(4)
    assert magic == b'\x5D\x2A\x4D\x18', 'not a valid warc.zst with a custom dictionary'
    dictSize = fp.read(4)
    assert len(dictSize) == 4, 'missing dict size'
    dictSize = struct.unpack('<I', dictSize)[0]
    assert dictSize >= 4, 'dict too small'
    assert dictSize < 100 * 1024**2, 'dict too large'
    ds = []
    dlen = 0
    while dlen < dictSize:
        c = fp.read(dictSize - dlen)
        if c is None or c == b'': # EOF
            break
        ds.append(c)
        dlen += len(c)
    d = b''.join(ds)
    assert len(d) == dictSize, f'could not read dict fully: expected {dictSize}, got {len(d)}'
    assert d.startswith(b'\x28\xB5\x2F\xFD') or d.startswith(b'\x37\xA4\x30\xEC'), 'not a valid dict'
    if d.startswith(b'\x28\xB5\x2F\xFD'): # Compressed dict
        # Decompress with zstd -d
        p = subprocess.Popen(['zstd', '-d'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        out, err = p.communicate(d)
        assert p.returncode == 0, f'zstd -d exited non-zero: return code {p.returncode}, stderr: {err!r}'
        d = out
    return d


input_file = 'imgur-2023-01.warc.zst'  # Set your input file path here

if not input_file:
    print('Input file not provided.', file=sys.stderr)
    sys.exit(1)

if not os.path.exists(input_file):
    print(f'Input file "{input_file}" not found.', file=sys.stderr)
    sys.exit(1)

with open(input_file, 'rb') as fp:
    d = get_dict(fp)

# Write the dictionary to a text file
with open('dict.txt', 'wb') as dict_file:
    dict_file.write(d)

# Extracting the dictionary and decompressing the file using the dictionary
output_file = 'output.warc'

subprocess.run(['zstd', '-d', input_file, '-D', 'dict.txt', '-o', output_file], check=True)

# Delete the dictionary file
os.remove('dict.txt')
