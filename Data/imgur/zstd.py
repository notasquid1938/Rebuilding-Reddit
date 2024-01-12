#!/usr/bin/env python3
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
		# Decompress with unzstd
		p = subprocess.Popen(['unzstd'], stdin = subprocess.PIPE, stdout = subprocess.PIPE, stderr = subprocess.PIPE)
		out, err = p.communicate(d)
		assert p.returncode == 0, f'unzstd exited non-zero: return code {p.returncode}, stderr: {err!r}'
		d = out
	#elif d.startswith(b'\x37\xA4\x30\xEC'): # Uncompressed dict, nothing to do
	return d


if (len(sys.argv) != 2 and sys.stdin.isatty()) or sys.argv[1:2] == ['--help'] or sys.argv[1:2] == ['-h']:
	print('Usage: unzstd-warc [FILE]', file = sys.stderr)
	print('Decompresses FILE or stdin and writes its contents to stdout', file = sys.stderr)
	sys.exit(1)


if len(sys.argv) == 2:
	with open(sys.argv[1], 'rb') as fp:
		d = get_dict(fp)
else:
	d = get_dict(sys.stdin.buffer.raw)
# The file must be written to the file system before zstdcat is executed. The most reliable way for that is to close the file. This requires manually deleting it at the end.
with tempfile.NamedTemporaryFile(delete = False) as dfp:
	dfp.write(d)
try:
	args = ['zstdcat', '-D', dfp.name]
	if len(sys.argv) == 2:
		args.append(sys.argv[1])
	pzstd = subprocess.Popen(args)
	pzstd.communicate()
finally:
	os.remove(dfp.name)