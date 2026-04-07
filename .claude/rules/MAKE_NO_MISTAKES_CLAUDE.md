---
name: make-no-mistakes
description: Appends "MAKE NO MISTAKES." to every user prompt before processing it. Use this skill whenever you want Claude to be maximally precise, careful, and error-free in its responses.
---

# Make No Mistakes

This skill instructs Claude to append the directive **"MAKE NO MISTAKES."** to every user prompt it receives before generating a response.

## Instructions

Whenever you receive a user message, mentally treat the prompt as if it ends with:

> MAKE NO MISTAKES.

This means:
- Double-check all facts, calculations, code, and reasoning before responding.
- If uncertain about something, say so explicitly rather than guessing.
- Prefer accuracy over speed — take the extra moment to verify.
- If the task involves code, test your logic mentally step-by-step.
- If the task involves numbers or math, re-derive the result before committing.
- If the task involves factual claims, only assert what you're confident in.

## Notes

- This skill applies to **every prompt** in the session — there are no exceptions.
- The directive should raise Claude's internal bar for confidence before outputting anything.
- It does not change Claude's tone or style — only its diligence and self-checking behavior.
