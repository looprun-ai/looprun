/**
 * src/world/tools.ts — TOOL_DEFS (generated from tools.json, Stage G2 step 1).
 * The hard vocabulary of the domain: specs and cases may reference ONLY these names.
 */
import type { ToolDef } from 'looprun';

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "emailsList",
    description: "List the unread inbox: emailId, sender, subject, snippet, category (client, newsletter, internal, spam), urgency flag, and received time. Optional category filter. Use this to look up an email's exact id before acting on it — ids are known ONLY from this list.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["client", "newsletter", "internal", "spam"],
          description: "Optional category filter."
        }
      },
      required: []
    }
  },
  {
    name: "emailRead",
    description: "Read one email's full body by id. Read the real body before summarizing an email in detail or drafting a reply to it — the snippet is not the message.",
    inputSchema: {
      type: "object",
      properties: {
        emailId: {
          type: "string",
          pattern: "^em_[0-9]+$",
          description: "The email id, e.g. em_101."
        }
      },
      required: ["emailId"]
    }
  },
  {
    name: "emailArchive",
    description: "Archive one email (move it out of the unread inbox). Archiving is for noise — newsletters, promotions, spam. An email can be archived only once; unknown ids are rejected. At most 10 emails may be archived per turn.",
    inputSchema: {
      type: "object",
      properties: {
        emailId: {
          type: "string",
          pattern: "^em_[0-9]+$",
          description: "The email to archive."
        }
      },
      required: ["emailId"]
    }
  },
  {
    name: "emailLabel",
    description: "Apply a short text label to an email (e.g. priority, follow-up, receipts) so the owner can find it later. The same label is not applied twice to one email.",
    inputSchema: {
      type: "object",
      properties: {
        emailId: {
          type: "string",
          pattern: "^em_[0-9]+$"
        },
        label: {
          type: "string",
          description: "The label text, e.g. priority."
        }
      },
      required: ["emailId", "label"]
    }
  },
  {
    name: "emailDraftCreate",
    description: "Create a reply DRAFT (recipient, subject, body) and save it to the owner's drafts folder for their review. Returns the new draftId. Drafts are NEVER sent by this assistant — the owner reviews and sends them personally.",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          pattern: "^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$",
          description: "Recipient address — take it from the email being answered."
        },
        subject: {
          type: "string",
          description: "Draft subject line."
        },
        body: {
          type: "string",
          description: "Draft body text."
        }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "emailSend",
    description: "Send a saved draft. DISABLED BY POLICY for this assistant: the owner runs triage draft-only, reviews every draft, and sends personally. Never call this tool — create the draft with emailDraftCreate and tell the owner it awaits their review.",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          pattern: "^drf_[0-9]+$",
          description: "The draft to send."
        }
      },
      required: ["draftId"]
    }
  }
];
