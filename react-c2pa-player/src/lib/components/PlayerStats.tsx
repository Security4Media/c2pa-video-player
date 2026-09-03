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

import { memo } from 'react';
import './PlayerStats.css';

type PlayerStatus = 'ready' | 'loading' | 'error';

interface StreamInfo {
  timestamp: string;
  message: string;
}

interface PlayerStatsData {
  currentTime: number;
  duration: number;
  buffered: number;
}

interface PlayerStatsProps {
  playerStatus: PlayerStatus;
  statusMessage: string;
  streamInfos: StreamInfo[];
  playerStats: PlayerStatsData;
}

export const PlayerStats = memo(function PlayerStats({
  playerStatus,
  statusMessage,
  streamInfos,
  playerStats,
}: PlayerStatsProps) {
  return (
    <div className="info-panel">
      <h3>
        Player Status: <span className={`status ${playerStatus}`}>{statusMessage}</span>
      </h3>
      <div id="streamInfo">
        {streamInfos.map((info, index) => (
          <div key={index}>
            [{info.timestamp}] {info.message}
          </div>
        ))}
      </div>
      <div id="playerStats">
        <div>Current Time: {playerStats.currentTime.toFixed(1)}s</div>
        <div>
          Duration: {playerStats.duration ? playerStats.duration.toFixed(1) + 's' : 'Unknown'}
        </div>
        <div>Buffered: {playerStats.buffered.toFixed(1)}s</div>
      </div>
    </div>
  );
});
