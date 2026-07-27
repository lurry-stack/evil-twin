-- Add WhatsApp group link to settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_group_link text;
