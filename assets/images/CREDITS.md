# Picture credits and licences

Every picture the site shows is a local file in `assets/images/opt/` (`<key>-480.jpg` and `<key>-960.jpg`).
No picture is ever loaded from another site, and none is taken from an event listing.

| Key | Subject | Origin | Licence |
|---|---|---|---|
| `music` | Trumpet player | Unsplash, photo id `1511192336575-5a79af67a629` | Unsplash License |
| `markets` | Market stalls | Unsplash, photo id `1533900298318-6b8da08a523e` | Unsplash License |
| `courses` | Cooking class | Unsplash, photo id `1556910103-1c02745aae4d` | Unsplash License |
| `community` | Group of friends | Unsplash, photo id `1517486808906-6ca8b3f04846` | Unsplash License |
| `culture` | Lanna craft stall | Supplied with the project; appears to be a generated illustration | Origin not independently verified |
| `dance` | Social dancing | Supplied with the project; appears to be a generated illustration | Origin not independently verified |
| `language` | Language exchange café | Supplied with the project; appears to be a generated illustration | Origin not independently verified |
| `night-out` | Night market crowd | Supplied with the project; appears to be a generated illustration | Origin not independently verified |
| `soul` | Temple interior | Supplied with the project; appears to be a generated illustration | Origin not independently verified |
| `workout` | Yoga studio | Supplied with the project; appears to be a generated illustration | Origin not independently verified |

The Unsplash License allows free commercial and non-commercial use without attribution.
It is not the same as CC0 / public domain.

## Adding a picture

The pipeline's matcher (`IMAGE_RULES` in `scraper_engine/normalize.py`) already has rules for
`lantern`, `river`, `outdoors`, `temple`, `food`, `art` and `talk`. Until a file with that key exists,
each rule falls back to the nearest picture above. To switch one on, add `<key>-480.jpg` and
`<key>-960.jpg` here in `opt/` and a row to the table. Only add pictures whose licence you have checked.
