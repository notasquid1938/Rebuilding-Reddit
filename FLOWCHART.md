graph TD
    A[Homepage] --> B{User Input}
    B -->|Date Range| C[Postgres Database]
    B -->|Subreddit Query| C[Postgres Database]
    C --> D[Retrieve Posts]
    D --> E{Check for Subreddit Icons}
    E -->|Icons Found| F[Fetch Icons from 'icons' Folder]
    E -->|No Icons| G[Default Icon]
    D --> H{Check for Imgur Links}
    H -->|Imgur Link Found| I{Check 'imgur-content' Folder}
    I -->|Content Found| J[Fetch from 'imgur-content' Folder]
    I -->|Content Not Found| K[Fetch from Imgur]
    F --> L[Display Posts]
    G --> L[Display Posts]
    J --> L[Display Posts]
    K --> L[Display Posts]
