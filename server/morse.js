// Morse code encoding/decoding utilities

const MORSE_MAP = {
  "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".",
  "F": "..-.", "G": "--.", "H": "....", "I": "..", "J": ".---",
  "K": "-.-", "L": ".-..", "M": "--", "N": "-.", "O": "---",
  "P": ".--.", "Q": "--.-", "R": ".-.", "S": "...", "T": "-",
  "U": "..-", "V": "...-", "W": ".--", "X": "-..-", "Y": "-.--",
  "Z": "--..", "1": ".----", "2": "..---", "3": "...--",
  "4": "....-", "5": ".....", "6": "-....", "7": "--...",
  "8": "---..", "9": "----.", "0": "-----",
  " ": "/",
};

const REVERSE_MORSE = Object.entries(MORSE_MAP).reduce((acc, [key, value]) => {
  acc[value] = key;
  return acc;
}, {});

class MorseDecoder {
  constructor() {
    this.currentSymbol = '';
    this.currentWord = '';
    this.symbolBuffer = [];
    this.wordBuffer = [];
    this.lastSignalTime = null;
  }

  addSignal(type, timestamp) {
    if (this.lastSignalTime && timestamp - this.lastSignalTime > 1500) {
      // Word gap detected
      this.finalizeSymbol();
      this.finalizeWord();
    } else if (this.lastSignalTime && timestamp - this.lastSignalTime > 800) {
      // Letter gap detected
      this.finalizeSymbol();
    }

    if (type === 'dot' || type === 'dash') {
      this.currentSymbol += type === 'dot' ? '.' : '-';
    }

    this.lastSignalTime = timestamp;
  }

  finalizeSymbol() {
    if (this.currentSymbol) {
      const character = REVERSE_MORSE[this.currentSymbol];
      if (character) {
        this.currentWord += character;
        this.symbolBuffer.push({
          symbol: this.currentSymbol,
          character: character,
          timestamp: Date.now()
        });
      }
      this.currentSymbol = '';
    }
  }

  finalizeWord() {
    if (this.currentWord.trim()) {
      this.wordBuffer.push({
        word: this.currentWord,
        timestamp: Date.now(),
        symbols: [...this.symbolBuffer]
      });
      this.currentWord = '';
      this.symbolBuffer = [];
    }
  }

  getDecodedText() {
    return this.wordBuffer.map(w => w.word).join(' ');
  }

  getRawSymbols() {
    return this.symbolBuffer.map(s => s.symbol).join(' ');
  }

  reset() {
    this.currentSymbol = '';
    this.currentWord = '';
    this.symbolBuffer = [];
    this.wordBuffer = [];
    this.lastSignalTime = null;
  }
}

// Encoding functions
function textToMorse(text) {
  return text.toUpperCase().split('').map(char => {
    return MORSE_MAP[char] || '';
  }).filter(code => code).join(' ');
}

function morseToText(morse) {
  return morse.split(' ').map(code => {
    return REVERSE_MORSE[code] || '';
  }).join('');
}

module.exports = {
  MORSE_MAP,
  REVERSE_MORSE,
  MorseDecoder,
  textToMorse,
  morseToText
};
