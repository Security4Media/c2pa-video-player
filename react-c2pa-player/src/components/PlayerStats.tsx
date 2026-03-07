import { memo } from 'react';

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
