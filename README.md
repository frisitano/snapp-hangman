# Mina Snapp: Snapp Hangman

This is a simple zero-knowldge Hangman snapp game built using Mina's snarkyjs library. The purpose of this game
is to explore the snarkyjs api and also exemplify usage of it's zero-knowledge capabilities. In the interest of
time it has been configured to be run via command line and takes commnad line input for Player 1 and Player 2.

## Game Description

Player 1 is responsible for choosing a secret word that Player 2 needs to guess. Player 1 keeps the
word secret and instead submits a commitment of the word hashed with some random input.
Player 2 must guess which characters are included in the secret word. She has a finite number
of lives. If she can guess the word before losing all lives then she wins.

## Implementation Description

The game will be instantiated by player 1. Player 1 will execute the `Hangman` contract constructor with required
arguments. Of particular interest are the arguments relating to the secret word, namely the secret word itself
and some additional randomness used to preserve privacy. The word and associated randomness are hashed using the
Poseiden hasing alogirthm and the resultant hash is stored in the circuit and serves as a commitment. The word
and random input remain private.

In zk-circuits we can not encode arbitrary data types and therefore we need a mechinism to serialise a string
as a `Field`. To this end we introduce a `Word` class which is responsible to modelling the secret word as
an array of characters in which each character is encoded as a field. This character / field arrray
is then serialised into a single field such that it can be stored in the circuit.

Once the contract has been deployed there are two methods which can be used to interact with it, namely `makeGuess`
and `checkGuess`. The `makeGuess` method is used by player 2 to submit characters guesses. This is achieved by updating
the contract state with the guess of player 2. The `checkGuess` method is used by player 1 to check if the chracter
guessed by player 2 is included in the secret word and if the guess is correct then the positions of the characters in the
secret word are revealed to player 2 via an update to the `guessedWord` which is stored in contract state.

The `makeGuess` and `checkGuess` methods will be executed sequentially repeatedly until the game is complete.

## How to play via cli

```sh
npx tsc && node build/src/index.js
```

## How to run tests

```sh
npm run test
npm run testw # watch mode
```

## How to run coverage

```sh
npm run coverage
```

## License

[Apache-2.0](LICENSE)
