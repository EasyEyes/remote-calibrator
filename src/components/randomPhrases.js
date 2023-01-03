// https://gist.github.com/cmacrander/bf864ff724f91bbe88d4

const adjectives = [
  'tall',
  'short',
  'up',
  'fancy',
  'busy',
  'loud',
  'crazy',
  'kind',
  'nice',
  'real',
  'speedy',
  'handy',
  'active',
  'alert',
  'bold',
  'brave',
  'bright',
  'calm',
  'clever',
  'cool',
  'free',
  'grand',
  'great',
  'happy',
  'jolly',
  'lucky',
  'spicy',
  'sunny',
  'super',
  'wise',
  'warm',
  'large',
]

const nouns = [
  // ANIMAL
  'bat',
  'bear',
  'bird',
  'cat',
  'cow',
  'deer',
  'dog',
  'dove',
  'dragon',
  'duck',
  'eagle',
  'fish',
  'fox',
  'frog',
  'goose',
  'lion',
  'mouse',
  'owl',
  'pig',
  'rat',
  'seal',
  'shark',
  'sheep',
  'snake',
  'spider',
  'tiger',
  'turkey',
  'viper',
  'whale',
  'wolf',
  // FOOD
  'onion',
  'carrot',
  'pear',
  'bean',
  'corn',
  'bread',
  'apple',
  'banana',
  'fig',
  'grape',
  'lemon',
  'lime',
  'orange',
  'peach',
  'plum',
  'dumpling',
  'cake',
  'pasta',
  'pot',
  'sushi',
  'coconut',
  'pizza',
  'burger',
  'hotpot',
  'sandwich',
  'steak',
  'soup',
  'taco',
  'tortilla',
  'watermelon',
  'yogurt',
  'zucchini',
  'noodles',
  // PLACE
  'beach',
  'forest',
  'mountain',
  'ocean',
  'plain',
  'river',
  'sea',
  'swamp',
  'valley',
  'cave',
  'cavern',
  'creek',
  'dungeon',
  'island',
  'jungle',
  'marsh',
]

const colors = [
  'blue',
  'bronze',
  'fire',
  'forest',
  'gold',
  'gray',
  'green',
  'navy',
  'purple',
  'red',
  'silver',
  'sky',
  'yellow',
  'neon',
  'black',
  'white',
  'brown',
  'aqua',
  'cyan',
  'turquoise',
  'teal',
  'magenta',
  'pink',
  'rose',
  'violet',
  'indigo',
  'lime',
  'olive',
  'maroon',
  'orange',
  'puce',
  'salmon',
  'tan',
  'wheat',
  'beige',
  'coral',
  'khaki',
  'mauve',
  'plum',
  'sage',
  'sienna',
  'almond',
  'apricot',
  'coconut',
  'colorless',
]

/**
 *
 * Randomly choose an item from the array
 *
 */
function randomChoice(a) {
  return a[Math.floor(Math.random() * a.length)]
}

/**
 *
 * Capitalize the first char of a string
 *
 */
function capFirst(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 *
 * Construct a random phrase,
 * e.g. NiceGoldDumpling201
 *
 */
export default function randomPhrases() {
  const tailNumber = '000' + new Date().getMilliseconds().toString()
  return (
    capFirst(randomChoice(adjectives)) +
    capFirst(randomChoice(colors)) +
    capFirst(randomChoice(nouns)) +
    tailNumber.substring(tailNumber.length - 3)
  )
}
