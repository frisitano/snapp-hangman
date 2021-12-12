import { sign } from 'crypto';
import {
  Field,
  PublicKey,
  SmartContract,
  state,
  State,
  method,
  UInt64,
  Bool,
  Poseidon,
  Signature,
  isReady,
  shutdown,
  Circuit,
  CircuitValue,
  Party,
  Int64,
  Mina,
  PrivateKey,
} from 'snarkyjs';
import readline from 'readline';

class Word {
  value: Field[];
  static charSize = 5;

  constructor(serializedWord: Field, length: Field) {
    const bits = serializedWord.toBits(Number(length.mul(Word.charSize)));
    let value = [];
    for (let i = 0; i < Number(length); i++) {
      value.push(
        Field.ofBits(
          bits.slice(i * Word.charSize, i * Word.charSize + Word.charSize)
        )
      );
    }
    this.value = value;
  }

  static fromString(word: string): Word {
    const chars = Array.from(word).map(Word.charToField);
    return new Word(Word.serialiseChars(chars), new Field(word.length));
  }

  static charToField(char: string): Field {
    // Convert to ascii and shift for compression
    return new Field(char === '_' ? 27 : char.charCodeAt(0) - 96);
  }

  static fieldToChar(field: Field): string {
    return Number(field) === 27 ? '_' : String.fromCharCode(Number(field) + 96);
  }

  static serialiseChars(word: Field[]) {
    const bits = word.map((x) => x.toBits(Word.charSize)).flat();
    return Field.ofBits(bits);
  }

  extractMatches(char: Field) {
    return this.value.map((x) => x.equals(char));
  }

  updateWithMatches(word: Word, char: Field) {
    const matches = word.extractMatches(char);
    this.value = this.value.map((x, i) => Circuit.if(matches[i], char, x));
  }

  equals(word: Word) {
    return this.value.map((x, i) => x.equals(word.value[i])).reduce(Bool.and);
  }

  hasMatches(char: Field) {
    return this.extractMatches(char).reduce(Bool.or);
  }

  serialise() {
    const bits = this.value.map((x) => x.toBits(Word.charSize)).flat();
    return Field.ofBits(bits);
  }

  toString() {
    return this.value.map((x) => Word.fieldToChar(x)).join('');
  }
}

export default class Hangman extends SmartContract {
  @state(Field) guessedWord: State<Field>;
  @state(Field) guessedLetter: State<Field>;
  @state(Field) incorrectGuessCount: State<Field>;
  @state(Bool) nextPlayer: State<Bool>;
  @state(Field) gameOutcome: State<Field>;
  player1: PublicKey;
  player2: PublicKey;
  wordCommitment: Field;
  wordLength: Field;
  guessLimit: Field;

  constructor(
    initialBalance: UInt64,
    address: PublicKey,
    player1: PublicKey,
    player2: PublicKey,
    word: Word,
    randomness: Field,
    guessLimit: Field
  ) {
    super(address);
    this.balance.addInPlace(initialBalance);
    this.guessedWord = State.init(
      Word.fromString('_'.repeat(word.value.length)).serialise()
    );
    this.guessedLetter = State.init(Field.zero);
    this.incorrectGuessCount = State.init(Field.zero);
    this.nextPlayer = State.init(new Bool(true));
    this.gameOutcome = State.init(Field.zero);
    this.wordLength = new Field(word.value.length);
    this.wordCommitment = new Field(
      Poseidon.hash(word.value.concat([randomness]))
    );
    this.guessLimit = guessLimit;
    this.player1 = player1;
    this.player2 = player2;
  }

  @method async makeGuess(pubkey: PublicKey, sig: Signature, letter: Field) {
    // Assert game is not complete
    const gameOutcome = await this.gameOutcome.get();
    gameOutcome.assertEquals(Field.zero);

    // Only player 2 can make guesses
    pubkey.assertEquals(this.player2);

    // check if its player 2's turn
    const nextPlayer = await this.nextPlayer.get();
    nextPlayer.assertEquals(true);

    // Verify sig
    sig.verify(pubkey, [letter]).assertEquals(true);

    // Submit guessedWord
    this.guessedLetter.set(letter);

    // Update nextPlayer
    this.nextPlayer.set(new Bool(false));
  }

  @method async checkGuess(
    pubkey: PublicKey,
    sig: Signature,
    word: Word,
    randomness: Field
  ) {
    // Assert game is not complete
    let gameOutcome = await this.gameOutcome.get();
    gameOutcome.assertEquals(Field.zero);

    // Only player 1 can check guesses
    pubkey.assertEquals(this.player1);

    // Is it player 2's turn?
    const nextPlayer = await this.nextPlayer.get();
    nextPlayer.assertEquals(false);

    // Verify sig
    sig.verify(pubkey, word.value.concat([randomness])).assertEquals(true);

    // Verify word
    Poseidon.hash(word.value.concat([randomness])).assertEquals(
      this.wordCommitment
    );

    // check guessedWord
    let guessedLetter = await this.guessedLetter.get();
    const hasMatches = word.hasMatches(guessedLetter);

    // increment incorrect counter
    const incorrectGuessCount = await this.incorrectGuessCount.get();
    const updatedIncorrectGuessCount = Circuit.if(
      hasMatches,
      incorrectGuessCount,
      incorrectGuessCount.add(1)
    );
    this.incorrectGuessCount.set(updatedIncorrectGuessCount);

    // update guessed word
    let guessedWord = new Word(await this.guessedWord.get(), this.wordLength);
    guessedWord.updateWithMatches(word, guessedLetter);
    this.guessedWord.set(guessedWord.serialise());

    // determine game outcome
    const wordFound = guessedWord.equals(word);
    gameOutcome = Circuit.if(
      updatedIncorrectGuessCount.equals(this.guessLimit),
      new Field(1),
      gameOutcome
    );
    gameOutcome = Circuit.if(wordFound, new Field(2), gameOutcome);
    this.gameOutcome.set(gameOutcome);
  }
}

export async function run() {
  await isReady;

  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);

  const player1 = Local.testAccounts[0].privateKey;
  const player2 = Local.testAccounts[1].privateKey;

  const snappPrivkey = PrivateKey.random();
  const snappPubkey = snappPrivkey.toPublicKey();

  const randomness = Field.random();
  const guessLimit = new Field(5);

  const rl = readline.createInterface({
    input: process.stdin, //or fileStream
    output: process.stdout,
  });
  let playerInput = 'o';
  rl.question(
    'Player 1 - please choose your word: ',
    (answer) => (playerInput = answer)
  );
  let word = Word.fromString(playerInput);

  console.log('Deploying contract');
  let snappInstance: Hangman;

  await Mina.transaction(player1, async () => {
    // player2 sends 1000000000 to the new snapp account
    const amount = UInt64.fromNumber(10000000);
    const p = await Party.createSigned(player2);
    p.body.delta = Int64.fromUnsigned(amount).neg();

    snappInstance = new Hangman(
      amount,
      snappPubkey,
      player1.toPublicKey(),
      player2.toPublicKey(),
      word,
      randomness,
      guessLimit
    );
  })
    .send()
    .wait();

  for (let i = 0; i < 10; i++) {
    let inputGuess = 'o';
    rl.question('Please enter your guess: ', (answer) => (inputGuess = answer));
    let guessLetter = Word.charToField(inputGuess);
    await Mina.transaction(player2, async () => {
      const signature = Signature.create(player2, [guessLetter]);
      await snappInstance.makeGuess(
        player2.toPublicKey(),
        signature,
        guessLetter
      );
    })
      .send()
      .wait();

    await Mina.transaction(player1, async () => {
      const signature = Signature.create(
        player1,
        word.value.concat([randomness])
      );
      await snappInstance.checkGuess(
        player1.toPublicKey(),
        signature,
        word,
        randomness
      );
    })
      .send()
      .wait();

    let b = await Mina.getAccount(snappPubkey);
    let latestGuess = new Word(
      b.snapp.appState[0],
      new Field(word.value.length)
    );
    console.log(latestGuess.toString());
  }
  rl.close();
}

run();
shutdown();
