# Picture credits and licences

Every picture the site shows is a local black-and-white file in `assets/images/opt/`
(`<key>-480.jpg`, `<key>-720.jpg` and `<key>-960.jpg`, cropped to 3:2 and converted to grayscale).
No picture is ever loaded from another site, and none is taken from an event listing.

| Key | Used for | Subject | Origin | Licence |
|---|---|---|---|---|
| `music` | Live Music default, jazz and blues | Saxophone in club light | Unsplash, photo id `1415201364774-f6f0bb35f28f` | Unsplash License |
| `live_music` | Bands, jams, open mics | Jazz quartet on stage | Unsplash, photo id `1541804627596-3b5b9ef58c93` | Unsplash License |
| `dance_latin` | Dance | Couple dancing | Unsplash, photo id `1748285098750-1d5c05968199` | Unsplash License |
| `soul` | Soul, meditation | Meditation silhouette | Unsplash, photo id `1600618528240-fb9fc964b853` | Unsplash License |
| `yoga_park` | Yoga | Yoga silhouette at sunset | Unsplash, photo id `1544367567-0f2fcb009e0b` | Unsplash License |
| `night_market` | Night markets, walking streets | Night market street | Unsplash, photo id `1783515426040-4581e2bcc4cc` | Unsplash License |
| `markets` | Morning and farmers' markets | Market stalls | Unsplash, photo id `1533900298318-6b8da08a523e` | Unsplash License |
| `culture` | Art & Culture | Lanna temple | Unsplash, photo id `1578157695179-d7b7ddeb2f53` | Unsplash License |
| `community` | Social & Meetups | Friends toasting on a terrace | Unsplash, photo id `1758272133395-b0f83eb6f554` | Unsplash License |
| `workout` | Workouts | Muay Thai pad work | Unsplash, photo id `1611824916163-a984d622d042` | Unsplash License |
| `river_tubing` | Tubing, river days | Tubing on a river | Unsplash, photo id `1783685710094-6de1f0ddbfd3` | Unsplash License |
| `courses` | Cooking classes, courses | Cooking class | Unsplash, photo id `1556910103-1c02745aae4d` | Unsplash License |
| `language` | Language exchanges, talks | Language exchange café | Supplied with the project; appears to be a generated illustration | Origin not independently verified |
| `night-out` | Dinners; last-resort fallback; social preview image | Night market crowd | Supplied with the project; appears to be a generated illustration | Origin not independently verified |
| `dance` | Fallback if `dance_latin` is removed | Social dancing | Supplied with the project; appears to be a generated illustration | Origin not independently verified |

The Unsplash License allows free commercial and non-commercial use without attribution.
It is not the same as CC0 / public domain.

## Adding a picture

The pipeline's matcher (`IMAGE_RULES` in `scraper_engine/normalize.py`) already has rules for
`lantern`, `outdoors`, `temple`, `food`, `art` and `talk`. Until a file with that key exists,
each rule falls back to the nearest picture above. To switch one on, add `<key>-480.jpg`,
`<key>-720.jpg` and `<key>-960.jpg` here in `opt/` and a row to the table. Convert it to
black and white first, and only add pictures whose licence you have checked.
