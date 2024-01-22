import warcio
from PIL import Image
from io import BytesIO
from urllib.parse import urlparse, unquote

def get_filename_from_url(url):
    # Parse the URL and extract the filename
    parsed_url = urlparse(url)
    filename = unquote(parsed_url.path.split("/")[-1])
    return filename

def save_image_from_warc(warc_filename, output_directory):
    with open(warc_filename, 'rb') as warc_file:
        for record in warcio.ArchiveIterator(warc_file):
            if record.rec_type == 'response':
                url = record.rec_headers.get_header('WARC-Target-URI')
                content_type = record.http_headers.get('Content-Type', '').lower()

                # Check if the response contains an image
                if 'image' in content_type:
                    image_data = record.content_stream().read()

                    # Get the filename from the URL
                    filename = get_filename_from_url(url)
                    output_image_filename = f"{output_directory}/{filename}"

                    # Save the image to a file
                    with open(output_image_filename, 'wb') as output_image_file:
                        output_image_file.write(image_data)

                    print(f"Image saved from URL: {url} to {output_image_filename}")
                    break  # Stop after the first image is saved

if __name__ == "__main__":
    warc_filename = r"C:\Users\Ben-Shoemaker\Desktop\Coding\Rebuild-Reddit\Data\imgur\imgur_20240106055037_f1cea2ab.1683789516.megawarc.warc"
    output_directory = "./Data/imgur/images"

    save_image_from_warc(warc_filename, output_directory)


# r"C:\Users\Ben-Shoemaker\Desktop\Coding\Rebuild-Reddit\Data\imgur\imgur_20240106055037_f1cea2ab.1683789516.megawarc.warc"