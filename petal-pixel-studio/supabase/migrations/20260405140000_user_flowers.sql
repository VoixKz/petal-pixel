CREATE TABLE public.user_flowers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flower_id TEXT NOT NULL,
  saved_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, flower_id)
);

ALTER TABLE public.user_flowers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own flowers"
  ON public.user_flowers FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own flowers"
  ON public.user_flowers FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own flowers"
  ON public.user_flowers FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own flowers"
  ON public.user_flowers FOR DELETE USING (auth.uid() = user_id);
