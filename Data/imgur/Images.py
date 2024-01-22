import os
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
                    output_media_filename = os.path.join(output_directory, filename)

                    # Save the media to a file
                    with open(output_media_filename, 'wb') as output_media_file:
                        output_media_file.write(media_data)

                    print(f"Media saved from URL: {url} to {output_media_filename}")

if __name__ == "__main__":
    input_directory = "./Data/imgur/"
    output_base_directory = "./Data/imgur/"

    # Iterate through each .warc file in the input directory
    for warc_filename in os.listdir(input_directory):
        if warc_filename.endswith(".warc"):
            # Create output directory for each WARC file
            output_directory = os.path.join(output_base_directory, os.path.splitext(warc_filename)[0] + "-media")
            os.makedirs(output_directory, exist_ok=True)

            # Save media from WARC file to corresponding output directory
            save_media_from_warc(os.path.join(input_directory, warc_filename), output_directory)
