from internetarchive.session import ArchiveSession
from internetarchive.search import Search
from internetarchive import get_item
import subprocess
import os

# Define start and stop points
start_point = 7
stop_point = 12  # Change this value to the desired stop point

s = ArchiveSession()
search = Search(s, '(collection:archiveteam_imgur)', '(sorts:addeddate)')

for count, result in enumerate(search, start=1):
    if count < start_point:
        continue  # Skip until start_point is reached
    if count > stop_point:
        break  # Exit the loop if stop_point is reached
    item_name = result['identifier']
    print(item_name)
    item = get_item(item_name)
    files = item.get_files()
    for file in files:
        if file.name.endswith("warc.zst"):
            print(file.name)
            subprocess.run(["ia", "download", item_name, "--glob", "*.warc.zst", "--no-directories", "--timeout=2000000"])
            downloaded_file = [f for f in os.listdir() if f.endswith('.warc.zst')][0]
            new_filename = f"imgur-2023-{count:05}.warc.zst"
            os.rename(downloaded_file, new_filename)
            print(f"Renamed {downloaded_file} to {new_filename}")
