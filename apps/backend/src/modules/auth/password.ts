import argon2 from "argon2";

export const passwordHasher = {
  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  },
  verify(encodedHash: string, password: string): Promise<boolean> {
    return argon2.verify(encodedHash, password);
  },
};
