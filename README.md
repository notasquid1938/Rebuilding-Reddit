## Rebuilding Reddit
https://redditrebuilt.com/ (Might be down, not hosted often)  
  
This is a NextJS website that attempts to create as thorough as possible an archive of reddit. It accomplishes this by creating a convenient way to view all the content from Pushift's archives of Reddit's comments and submissions over the years.

It uses Postgres to store all the reddit pushshift archives in tables and query them as necessary. You can search the archive using a selected date range and optionally add a specific subreddit.

## Setup Instructions
1. Clone the github repo
2. Download the reddit data, subreddits and comments, from the [academic torrent](https://academictorrents.com/details/9c263fc85366c1ef8f5bb9da0203f4c8c8db75f4) into `Data/` (the loader container can also fetch it)
3. From `reddit-clone/`, run `docker compose up -d --build`. This starts Postgres, the loader (which turns the `.zst` dumps into monthly tables, indexes them and builds the subreddit metadata) and the website on port 3001
4. See [reddit-clone/README.md](reddit-clone/README.md) for configuration and the maintenance scripts
5. Done

## Long Term Goals
- [x] Switch the database being used from MongoDB to PostgreSQL, its not an issue right now but anyone who want to actually use ALL of Reddit's data will inevitably run into a major database bottleneck
- [ ] Create and publish an updated list of all subreddits ever, Watchful1 has a great list, but it only goes up to 2022 and includes user profile subreddits (those beginning with r/u_ which aren't really needed 
- [ ] Rebuild Imgur using [Archive Team's Backups](https://archive.org/details/archiveteam_imgur) so that most image posts on reddit will be viewable. This sounds pretty ambitious, but schema analysis indicates ~20% of all reddit posts used an imgur image so it is very important to try eventually even though the storage requierements will be insane (746TB).

## Flowchart
Below is a diagram designed using mermaid.js to help illustrate the website's architecture
![Screenshot 2024-05-17 023934](https://github.com/notasquid1938/Rebuilding-Reddit/assets/99005612/1d81941d-5efa-46d8-8bd0-293f91dd8182)
