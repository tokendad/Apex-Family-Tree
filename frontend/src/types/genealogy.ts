export interface PersonSummary {
  id: string;
  given_name: string | null;
  surname: string | null;
  birth_date: string | null;
  death_date: string | null;
  photo_url: string | null;
}

export interface FamilySummary {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  spouse1: PersonSummary | null;
  spouse2: PersonSummary | null;
  marriage_date: string | null;
  marriage_place: string | null;
}
