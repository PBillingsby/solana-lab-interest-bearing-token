import {
  sendAndConfirmTransaction,
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  PublicKey,
} from '@solana/web3.js';

import {
  ExtensionType,
  createInitializeMintInstruction,
  createInitializeInterestBearingMintInstruction,
  mintTo,
  createAccount,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
  transferChecked,
  getMint,
  getInterestBearingMintConfigState,
  updateRateInterestBearingMint,
  amountToUiAmount,
} from '@solana/spl-token';
import { initializeKeypair } from './keypair-helpers';

(async () => {
  const connection = new Connection("http://127.0.0.1:8899", 'confirmed');
  const payer = await initializeKeypair(connection);
  const otherAccount = Keypair.generate();
  const mintAuthority = payer;
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const rateAuthority = payer;
  const rate = 32_767;

  const extensions = [ExtensionType.InterestBearingConfig];
  const mintLen = getMintLen(extensions);
  const decimals = 9;

  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  const mintTransaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeInterestBearingMintInstruction(
      mint,
      rateAuthority.publicKey,
      rate,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(mint, decimals, mintAuthority.publicKey, null, TOKEN_2022_PROGRAM_ID)
  );

  await sendAndConfirmTransaction(connection, mintTransaction, [payer, mintKeypair], undefined);

  const mintAccount = await getMint(
    connection,
    mint,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );

  {
    // Logs out interest on token
    const rate = await getInterestBearingMint({ connection, mint })
    const amount = 100;
    // Convert amount to UI amount with accrued interest
    const uiAmount = await amountToUiAmount(
      connection,
      payer,
      mint,
      amount,
      TOKEN_2022_PROGRAM_ID,
    );

    console.log(`Amount with accrued interest at ${rate}: ${amount} tokens = ${uiAmount}% `);
  }

  {
    // Attempts to update interest on token
    testTryingToUpdateTokenInterestRate({
      connection,
      payer,
      mint
    })
  }

  {
    // Attempts to update interest on token
    testTryingToUpdateTokenInterestRateWithWrongOwner({
      connection,
      payer: otherAccount,
      mint
    })
  }
})();

interface GetInterestBearingMint {
  connection: Connection;
  mint: PublicKey;
}

async function getInterestBearingMint(inputs: GetInterestBearingMint) {
  const { connection, mint } = inputs
  const mintAccount = await getMint(
    connection,
    mint,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );

  // Get Interest Config for Mint Account
  const interestBearingMintConfig = await getInterestBearingMintConfigState(
    mintAccount,
  );

  return interestBearingMintConfig?.currentRate
}

interface UpdateInterestRate {
  connection: Connection;
  payer: Keypair;
  mint: PublicKey;
}

async function testTryingToUpdateTokenInterestRate(inputs: UpdateInterestRate) {
  const { connection, payer, mint } = inputs;
  const rate = 0;
  const initialRate = await getInterestBearingMint({ connection, mint })
  try {
    await updateRateInterestBearingMint(
      connection,
      payer,
      mint,
      payer,
      rate,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    const newRate = await getInterestBearingMint({ connection, mint })

    console.log(`✅ - We expected this to pass because the rate has been updated. Old rate: ${initialRate}. New rate: ${newRate}`);
  } catch (error) {
    console.error("You should be able to update the interest.");

  }
}

async function testTryingToUpdateTokenInterestRateWithWrongOwner(inputs: UpdateInterestRate) {
  // in this test case, payer is "otherAccount", which isn't the original payer
  const { connection, payer, mint } = inputs;
  const rate = 0;
  try {
    await updateRateInterestBearingMint(
      connection,
      payer,
      mint,
      payer,
      rate,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    console.log("You should be able to update the interest.");
  } catch (error) {
    console.error(`✅ - We expected this to fail because the owner is incorrect.`);

  }
}


