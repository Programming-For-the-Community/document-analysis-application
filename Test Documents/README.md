# Test Documents

This folder contains synthetic test data generated for development and testing of the Document Analysis Application. **All content is entirely fictional.** No real companies, people, financial figures, addresses, or business transactions are represented.

## Purpose

These documents exist to:
- Test the document upload pipeline (single files and folder uploads)
- Provide realistic, varied content for the AI analysis and relationship graph features once the pipeline is active
- Verify that DynamoDB records and S3 storage are created correctly across different document types

## Companies

### Acme Manufacturing Co.
A fictional precision parts manufacturer based in Columbus, OH. Documents cover internal HR policies, outbound shipping invoices to fictional customers, and purchase orders placed with fictional suppliers.

### Pinnacle Distribution Group
A fictional third-party logistics (3PL) and fulfillment company based in Indianapolis, IN. Documents cover HR operations, client billing invoices for warehousing and freight services, equipment and supply procurement, and internal operational emails.

## Document Types

| Folder | Contents |
|---|---|
| `HR/` | Employee handbook, onboarding checklist, performance review, job posting, disciplinary notice, benefits guide |
| `Shipping Invoices/` | Outbound invoices to customers / clients for goods shipped or services rendered |
| `Order Forms/` | Purchase orders placed with vendors for materials, supplies, equipment, or services |
| `Emails/` | Internal and external email threads covering operations, vendor relations, staffing, and client communication |

## Cross-Document References

The documents are internally consistent — people, invoice numbers, PO numbers, and events mentioned in one document are referenced in others. For example:

- Acme's `ORD-2024-0112` (Order Forms) is cited on `INV-SH-2024-0045` (Shipping Invoices)
- Pinnacle's ops review email references the FedEx delay described in the delay notice email, the Gardner kitting error from invoice `INV-SH-2024-0202`, and the disciplinary action in `HR/`
- The Acme Q4 production schedule email references the same shutdown window announced in the all-staff holiday email

This cross-referencing is intentional to produce meaningful relationship graph data when the AI pipeline processes these documents.

## Disclaimer

> All names, companies, addresses, phone numbers, email addresses, financial figures, part numbers, and other details in these documents are entirely fictitious and generated for testing purposes only. Any resemblance to real persons, businesses, or events is coincidental.