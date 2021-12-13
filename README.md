# Mina Snapp: Snapp Hangman

This is a simple Hangman snapp game built using Mina's zero-knowledge snarkyjs library. Player 1 is
responsible for choosing a secret word that Player 2 needs to guess. Player 1 keeps the
word secret and instead submits a commitment of the word hashed with some random input.
Player 2 must guess which characters are included in the secret word. She has a finite number
of lives. If she can guess the word before losing all lives then she wins. In the interest of
time it has been configured to be run via command line and takes commnad line input for Player
1 and Player 2.

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
