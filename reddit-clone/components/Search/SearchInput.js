import { autocomplete } from '@algolia/autocomplete-js'
import {
  meilisearchAutocompleteClient,
  getMeilisearchResults,
} from '@meilisearch/autocomplete-client'
import '@algolia/autocomplete-theme-classic'

const searchClient = meilisearchAutocompleteClient({
  url: 'https://ms-adf78ae33284-106.lon.meilisearch.io', // Host
  apiKey: 'a63da4928426f12639e19d62886f621130f3fa9ff3c7534c5d179f0f51c4f303'  // API key
})

autocomplete({
  container: '#autocomplete',
  placeholder: 'Search for games',
  getSources({ query }) {
    return [
      {
        sourceId: 'steam-video-games',
        getItems() {
          return getMeilisearchResults({
            searchClient,
            queries: [
              {
                indexName: 'steam-video-games',
                query,
              },
            ],
          })
        },
        templates: {
          item({ item, components, html }) {
            return html`<div>
              <div>${item.name}</div>
            </div>`
          },
        },
      },
    ]
  },
})
