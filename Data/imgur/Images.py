# .gifv are just some metadata for .gifs this should get everything

import warcio
from urllib.parse import urlparse, unquote

def get_filename_from_url(url):
    # Parse the URL and extract the filename
    parsed_url = urlparse(url)
    filename = unquote(parsed_url.path.split("/")[-1])
    return filename

def save_media_from_warc(warc_filename, output_directory):
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
                    output_media_filename = f"{output_directory}/{filename}"

                    # Save the media to a file
                    with open(output_media_filename, 'wb') as output_media_file:
                        output_media_file.write(media_data)

                    print(f"Media saved from URL: {url} to {output_media_filename}")

if __name__ == "__main__":
    warc_filename = r"C:\Users\Ben-Shoemaker\Desktop\Coding\Rebuild-Reddit\Data\imgur\imgur_20240106055037_f1cea2ab.1683789516.megawarc.warc"
    output_directory = "./Data/imgur/media"

    save_media_from_warc(warc_filename, output_directory)
