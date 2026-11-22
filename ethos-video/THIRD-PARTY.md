# Third-party software

## Metadata and artwork sources

- **Cinemeta / Stremio** — unofficial public addon endpoint used for keyless
  movie/series metadata; posters/backdrops are served from
  `images.metahub.space` and cached locally. No software is bundled.
- **TVmaze** — series data licensed under CC BY-SA 4.0
  (https://www.tvmaze.com/api); attribution is shown in Settings.
- **TMDB** — optional, user-supplied API key. This product uses the TMDB API but
  is not endorsed or certified by TMDB (https://www.themoviedb.org/).

Artwork remains the property of its respective owners and is cached only for
personal display in this self-hosted library.

## hls.js 1.7.4

- Source: https://github.com/video-dev/hls.js
- Vendored file: `frontend/hls.min.js` (UMD build from
  https://cdn.jsdelivr.net/npm/hls.js@1.7.4/dist/hls.min.js)
- License: Apache License 2.0

Copyright (c) 2017 Dailymotion (http://www.dailymotion.com)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

`src/remux/mp4-generator.js` and `src/demux/exp-golomb.ts` in hls.js are derived
from the HLS library for video.js (https://github.com/videojs/videojs-contrib-hls).
That work is also covered by the Apache 2 License, following copyright:
Copyright (c) 2013-2015 Brightcove

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
