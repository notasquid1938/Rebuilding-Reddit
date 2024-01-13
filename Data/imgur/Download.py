##Archives: https://archive.org/details/archiveteam_imgur

import subprocess

prefix = "archiveteam_imgur_"

collection = "20240101043443_7d94c168"

file = prefix + collection

try:
    subprocess.run(f'ia download {file}', shell=True, check=True)

except subprocess.CalledProcessError as e:
    print(f"Error: {e}")
