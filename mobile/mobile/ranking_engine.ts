export type Player = {
    name: string;
    position: string;
    team: string;
    value: number;
    rank: number;
    age?: number;
    adjustedValue?: number;
  };
  
  type Swipe = {
    trade: string; // e.g. "Tyreek Hill + 2025 2nd → Garrett Wilson"
    choice: "Side A" | "Side B";
  };

  export type StoredSwipe = Swipe & {
    timestamp: string;
  };
  
  const K_FACTOR = 40;
  const DIMINISH_THRESHOLD = 0.6;
  
  function parseTrade(trade: string) {
    const [a, b] = trade.split(" → ").map(s => s.split(" + ").map(s => s.trim()));
    return [a, b];
  }
  
  function getSideTotal(side: string[], baseValues: Record<string, number>): number {
    return side.reduce((sum, name) => sum + (baseValues[name] || 500), 0);
  }
  
  function getTopShare(side: string[], baseValues: Record<string, number>): number {
    const values = side.map(name => baseValues[name] || 500);
    const total = values.reduce((a, b) => a + b, 0);
    const top = Math.max(...values);
    return total === 0 ? 0 : top / total;
  }
  
  function getAdjustedValue(side: string[], baseValues: Record<string, number>): number {
    const topShare = getTopShare(side, baseValues);
    const useDiminished = topShare < DIMINISH_THRESHOLD;
  
    return side.reduce((sum, name) => {
      const val = baseValues[name] || 500;
      return sum + (useDiminished ? Math.pow(val, 0.9) : val);
    }, 0);
  }
  
  export function getPersonalizedRankings(
    baseRankings: Player[],
    swipeHistory: StoredSwipe[]
  ): Player[] {
    const HALF_LIFE = 14; // in days
    const baseValues: Record<string, number> = {};
    baseRankings.forEach(p => {
      baseValues[p.name] = p.value;
    });
  
    const playerAdjustments: Record<string, number> = {};
  
    const getDecayWeight = (timestamp: string, halfLife = HALF_LIFE): number => {
      const now = Date.now();
      const then = new Date(timestamp).getTime();
      const daysOld = (now - then) / (1000 * 60 * 60 * 24);
      return Math.exp(-Math.log(2) * daysOld / halfLife);
    };
  
    for (const swipe of swipeHistory) {
      const [sideA, sideB] = parseTrade(swipe.trade);
      const winner = swipe.choice === "Side A" ? sideA : sideB;
      const loser = swipe.choice === "Side A" ? sideB : sideA;
  
      const winnerAdj = getAdjustedValue(winner, baseValues);
      const loserAdj = getAdjustedValue(loser, baseValues);
  
      const expectedWinner = 1 / (1 + Math.pow(10, (loserAdj - winnerAdj) / 400));
      const baseDelta = K_FACTOR * (1 - expectedWinner);
      const decayWeight = getDecayWeight(swipe.timestamp);
      const weightedDelta = baseDelta * decayWeight;
  
      const update = (side: string[], isWinner: boolean) => {
        const sideTotal = getSideTotal(side, baseValues);
        for (const name of side) {
          const base = baseValues[name] || 500;
          const share = base / sideTotal;
          const change = share * weightedDelta * (isWinner ? 1 : -1);
          playerAdjustments[name] = (playerAdjustments[name] || 0) + change;
        }
      };
  
      update(winner, true);
      update(loser, false);
    }
  
    // Merge adjustments with base rankings
    const personalized = baseRankings.map(player => ({
      ...player,
      adjustedValue: player.value + (playerAdjustments[player.name] || 0),
    }));
  
    return personalized.sort((a, b) => b.adjustedValue - a.adjustedValue);
  }
  
  