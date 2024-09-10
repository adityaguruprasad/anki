// spacedRepetition.js
const calculateNextReview = (card, quality) => {
    let { ease_factor, interval } = card;
    
    // If it's the first review, set initial interval
    if (!interval) {
      interval = quality < 3 ? 1 : 6;
    } else {
      // Calculate new interval
      if (quality >= 3) {
        interval = Math.round(interval * ease_factor);
      } else {
        interval = 1;
      }
    }
  
    // Update ease factor
    if (quality === 0) {
      ease_factor = Math.max(1.3, ease_factor - 0.2);
    } else if (quality === 5) {
      ease_factor += 0.15;
    }
  
    // Calculate next review date
    const next_review = new Date();
    next_review.setDate(next_review.getDate() + interval);
  
    return {
      ease_factor,
      interval,
      next_review
    };
  };
  
  module.exports = { calculateNextReview };