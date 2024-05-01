# RUN THIS IN THE IMGUR FOLDER

import os
import warcio
from urllib.parse import urlparse, unquote

archive_name = "imgur-2023-02"

def get_filename_from_url(url):
    # Parse the URL and extract the filename
    parsed_url = urlparse(url)
    filename = unquote(parsed_url.path.split("/")[-1])
    return filename

def save_media_from_warc(warc_filename, output_directory):
    # Create the output directory if it doesn't exist
    if not os.path.exists(output_directory):
        os.makedirs(output_directory)

    with open(warc_filename, 'rb') as warc_file:
        for record in warcio.ArchiveIterator(warc_file):
            if record.rec_type == 'response':
                url = record.rec_headers.get_header('WARC-Target-URI')
                content_type = record.http_headers.get('Content-Type', '').lower()

                # Check if the response contains media (image or video)
                if 'image' in content_type or 'video' in content_type:
                    media_data = record.content_stream().read()

                    # Get the filename from the URL
                    filename = get_filename_from_url(url)
                    output_media_filename = os.path.join(output_directory, filename)

                    try:
                        # Save the media to a file
                        with open(output_media_filename, 'wb') as output_media_file:
                            output_media_file.write(media_data)

                        print(f"Media saved from URL: {url} to {output_media_filename}")
                    except Exception as e:
                        # Log the issue in error.txt
                        with open("error.txt", "a") as error_file:
                            error_file.write(f"Error: {str(e)} - URL: {url}\n")

if __name__ == "__main__":
    warc_filename = "./" + archive_name + ".warc"
    output_directory = "./" + archive_name + "/"

    save_media_from_warc(warc_filename, output_directory)
