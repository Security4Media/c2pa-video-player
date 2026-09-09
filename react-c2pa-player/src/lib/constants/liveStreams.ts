/*
 * Copyright 2026 European Broadcasting Union
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface LiveStreamEntry {
  name: string;
  url: string;
}

// Curated demo-only DASH live streams, owned by partner organizations (WDR,
// CBC, Unified Streaming) rather than this repo - not SLA-backed, may go
// offline or change without notice.
export const LIVE_STREAMS: readonly LiveStreamEntry[] = [
  {
    name: 'Glitch WDR live',
    url: 'https://d21g97cfbcpuxt.cloudfront.net/channel1/channel1.isml/.mpd',
  },
  {
    name: 'WDR live',
    url: 'https://d1xxal58esrfbz.cloudfront.net/channel1/channel1.isml/.mpd',
  },
  {
    name: 'Unifiedstreaming Mix live',
    url: 'https://demo.unified-streaming.com/vc-c2pa-ibc/bbb_wdr_colourbars.isml/.mpd',
  },
  {
    name: 'CBC live',
    url: 'https://d19gz2xgmiot3b.cloudfront.net/channel1/channel1.isml/.mpd',
  },
  {
    name: 'CBC glitch',
    url: 'https://d1q6rzdaolqpdz.cloudfront.net/channel1/channel1.isml/.mpd',
  },
] as const;
