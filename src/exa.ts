import Exa from "exa-js"

export const hasExaApiKey = Boolean(process.env.EXA_API_KEY)

export const exa = new Exa()
